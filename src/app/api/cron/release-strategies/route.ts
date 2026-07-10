import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { releaseStrategy } from "@/lib/strategy-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hourly Vercel cron. Releases any strategy that is complete, unreleased, and
// past its review_deadline — sending the same client email as a manual release.
// Vercel injects `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  const ok =
    !!secret &&
    (auth === `Bearer ${secret}` || url.searchParams.get("secret") === secret);
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await admin
    .from("strategies")
    .select("id")
    .eq("status", "complete")
    .is("released_at", null)
    .lte("review_deadline", nowIso);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let released = 0;
  let emailed = 0;
  const errors: string[] = [];
  for (const row of due ?? []) {
    try {
      const res = await releaseStrategy(row.id);
      if (res.released) {
        released++;
        if (res.emailed) emailed++;
      }
    } catch (e) {
      errors.push(`${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: due?.length ?? 0,
    released,
    emailed,
    errors,
  });
}
