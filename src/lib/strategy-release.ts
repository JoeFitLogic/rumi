import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendStrategyReleasedEmail } from "@/lib/email";

export interface ReleaseResult {
  released: boolean;
  alreadyReleased?: boolean;
  emailed?: boolean;
  reason?: string;
}

/**
 * Release a completed strategy to its client: stamp released_at and send the
 * "Niamh has finished building your strategy" email. Idempotent — a strategy
 * already released is a no-op. Shared by the admin "Release now" action and
 * the hourly auto-release cron.
 */
export async function releaseStrategy(strategyId: string): Promise<ReleaseResult> {
  const admin = createAdminClient();

  const { data: strategy } = await admin
    .from("strategies")
    .select("id, user_id, status, released_at, client_name")
    .eq("id", strategyId)
    .maybeSingle();

  if (!strategy) return { released: false, reason: "not found" };
  if (strategy.released_at) return { released: false, alreadyReleased: true };
  if (strategy.status !== "complete") {
    return { released: false, reason: `status is ${strategy.status}` };
  }

  const releasedAt = new Date().toISOString();
  // Guard against a race: only release if still unreleased.
  const { data: updated, error } = await admin
    .from("strategies")
    .update({ released_at: releasedAt })
    .eq("id", strategyId)
    .is("released_at", null)
    .select("id")
    .maybeSingle();
  if (error) return { released: false, reason: error.message };
  if (!updated) return { released: false, alreadyReleased: true };

  const { data: profile } = await admin
    .from("profiles")
    .select("email, name")
    .eq("id", strategy.user_id)
    .maybeSingle();

  let emailed = false;
  if (profile?.email) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const res = await sendStrategyReleasedEmail({
      to: profile.email,
      clientName: profile.name || strategy.client_name || "there",
      link: `${siteUrl}/strategy`,
    });
    emailed = res.ok;
  }

  return { released: true, emailed };
}
