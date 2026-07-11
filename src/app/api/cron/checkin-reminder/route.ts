import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/cron";
import { mondayOf } from "@/lib/checkin";
import { sendCheckinReminderEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Check-in reminder cron. Two schedules point here:
//   Monday  07:00 UTC → ?stage=first   (warm first nudge)
//   Thursday 07:00 UTC → ?stage=second  (gentler second nudge)
// Emails every active client (>7 days old) who has NO check-in for the current
// week. Service role by design; reads are owner-agnostic counts, sends go only
// to each client's own email.
export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const stageParam = url.searchParams.get("stage");
  // Fall back to weekday if not passed: Thu → second, else first.
  const stage: "first" | "second" =
    stageParam === "second" || (stageParam === null && new Date().getUTCDay() === 4)
      ? "second"
      : "first";

  const db = createAdminClient();
  const week = mondayOf(new Date());
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const link = `${siteUrl}/check-in`;

  // Active, established clients.
  const { data: clients, error } = await db
    .from("profiles")
    .select("id, name, email")
    .eq("role", "client")
    .eq("account_status", "active")
    .lt("created_at", sevenDaysAgo);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Who already checked in this week.
  const { data: done } = await db
    .from("checkin_responses")
    .select("user_id")
    .eq("week_starting", week);
  const checkedIn = new Set((done ?? []).map((r) => r.user_id as string));

  const missing = (clients ?? []).filter((c) => !checkedIn.has(c.id as string) && c.email);

  let sent = 0;
  let errored = 0;
  const errors: string[] = [];

  for (const c of missing) {
    try {
      const res = await sendCheckinReminderEmail({
        to: c.email as string,
        clientName: (c.name as string | null) ?? "",
        stage,
        link,
      });
      if (res.ok) sent++;
      else {
        errored++;
        errors.push(`${c.id}: ${res.error}`);
      }
    } catch (e) {
      errored++;
      errors.push(`${c.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    stage,
    week,
    candidates: missing.length,
    sent,
    errored,
    errors,
  });
}
