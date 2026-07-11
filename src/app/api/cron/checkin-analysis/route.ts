import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/cron";
import { mondayOf } from "@/lib/checkin";
import { analyzeClientWeek } from "@/lib/checkin-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Pro allows up to 300s. Clients are processed sequentially in one
// invocation. If client volume ever makes this too slow, split into a per-client
// route the cron fans out to (reference/porting-notes.md §5) — start simple.
export const maxDuration = 300;

// Saturday 07:00 UTC cron. For every client with a check-in for the current
// week, analyse their last ~6 weeks and upsert one checkin_analysis row.
// Service role by design (crosses clients); every read/write is owner-scoped.
export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const week = mondayOf(new Date());

  // Clients who submitted a check-in this week.
  const { data: weekRows, error } = await db
    .from("checkin_responses")
    .select("user_id")
    .eq("week_starting", week);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = [...new Set((weekRows ?? []).map((r) => r.user_id as string))];
  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, week, total: 0, analysed: 0, skipped: 0, errored: 0, redFlags: 0 });
  }

  const { data: profiles } = await db
    .from("profiles")
    .select("id, name")
    .in("id", userIds);
  const nameOf = new Map((profiles ?? []).map((p) => [p.id as string, (p.name as string | null) ?? "the client"]));

  let analysed = 0;
  let skipped = 0;
  let errored = 0;
  let redFlags = 0;
  const errors: string[] = [];

  // Sequential + per-client try/catch is inside analyzeClientWeek (returns a
  // result, never throws) — one client failing can never kill the run.
  for (const userId of userIds) {
    const res = await analyzeClientWeek(db, userId, week, nameOf.get(userId) ?? "the client");
    if (res.status === "analysed") {
      analysed++;
      if (res.hadRedFlags) redFlags++;
    } else if (res.status === "skipped") {
      skipped++;
    } else {
      errored++;
      errors.push(`${userId}: ${res.error}`);
    }
  }

  const summary = { ok: true, week, total: userIds.length, analysed, skipped, errored, redFlags, errors };

  // Fail the whole run only if EVERY client errored.
  if (errored === userIds.length && userIds.length > 0) {
    return NextResponse.json({ ...summary, ok: false }, { status: 500 });
  }
  return NextResponse.json(summary);
}
