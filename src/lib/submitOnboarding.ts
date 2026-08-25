import "server-only";
import { tasks } from "@trigger.dev/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { provisionClientAccount } from "@/lib/provision";
import type { GenerateStrategyPayload } from "@/trigger/generate-strategy";

// The one intake pipeline, shared by BOTH entry points:
//   • /onboarding          → the native Resonance form  (source: "native")
//   • POST /api/intake     → the legacy GHL webhook     (source: "ghl")
//
// Extracted verbatim from the /api/intake route so the two can never drift.
// The ORDER here is deliberate and unchanged from that route: provision (which
// sends the invite) happens before the in-flight dedupe, so a resubmit re-sends
// a fresh set-password link rather than silently doing nothing. Do not reorder
// without deciding what a resubmit should do about the email.
//
// Service-role throughout: there is no session on either path (the webhook
// authenticates with INTAKE_SECRET, the form with ONBOARDING_FORM_KEY), so RLS
// cannot be used. Every write below carries an explicit owner filter or is an
// insert of a row we just created the owner for — per
// docs/production-db-guidelines.md.

const REVIEW_WINDOW_DAYS = 3;

export type IntakeSource = "native" | "ghl";

export interface SubmitOnboardingResult {
  ok: true;
  userId: string;
  strategyId: string;
  /** true when a strategy was already pending/generating and we did not fire
   *  a second generation (Cleo's double-generation bug). */
  deduped: boolean;
  inviteSent: boolean;
  inviteError?: string;
}

/**
 * Provision the account, store the answers, create the review-queue row and
 * fire strategy generation.
 *
 * `responses` must already be mapped to onboarding_responses column names
 * (mapIntakePayload for the webhook, the form's own column-keyed state for the
 * native form). Keys that are not real columns will fail the insert.
 */
export async function submitOnboarding(opts: {
  email: string;
  name: string;
  responses: Record<string, string | null>;
  source: IntakeSource;
}): Promise<SubmitOnboardingResult> {
  const email = opts.email.trim().toLowerCase();
  const name = opts.name.trim();
  const firstName = name.split(" ")[0] || null;

  // 1. Get-or-create the client account + send the set-password invite.
  const { userId, inviteSent, inviteError } = await provisionClientAccount({
    email,
    name,
    sendInvite: true,
  });

  // provisionClientAccount never throws on a failed invite -- it reports it, so
  // a send failure can't lose the submission. But a silent failure means the
  // client is told "check your email" for a mail that never went. Surface it in
  // the server logs, and hand it back so the caller can soften what it says.
  if (!inviteSent) {
    console.error(
      `[intake] invite email NOT sent to ${email} (source=${opts.source}): ${inviteError ?? "unknown reason"}`
    );
  }

  const admin = createAdminClient();

  // 2. Idempotency: if a strategy is already pending/generating for this user,
  //    do not double-fire.
  const { data: inflight } = await admin
    .from("strategies")
    .select("id, status")
    .eq("user_id", userId)
    .in("status", ["pending", "generating"])
    .limit(1)
    .maybeSingle();
  if (inflight) {
    return {
      ok: true,
      userId,
      strategyId: inflight.id,
      deduped: true,
      inviteSent,
      inviteError,
    };
  }

  // 3. Insert the onboarding responses (status 'submitted').
  const { data: onboarding, error: onbErr } = await admin
    .from("onboarding_responses")
    .insert({
      user_id: userId,
      status: "submitted",
      submission_source: opts.source,
      ...opts.responses,
    })
    .select("id")
    .single();
  if (onbErr || !onboarding) {
    throw new Error(`onboarding insert failed: ${onbErr?.message}`);
  }

  // 4. Create the strategy row: pending, review deadline = now + 3 days.
  const reviewDeadline = new Date(
    Date.now() + REVIEW_WINDOW_DAYS * 86_400_000
  ).toISOString();
  const { data: strategy, error: stratErr } = await admin
    .from("strategies")
    .insert({
      user_id: userId,
      onboarding_id: onboarding.id,
      client_name: firstName,
      status: "pending",
      review_deadline: reviewDeadline,
    })
    .select("id")
    .single();
  if (stratErr || !strategy) {
    throw new Error(`strategy insert failed: ${stratErr?.message}`);
  }

  // 5. Fire the generation task (enqueues fast).
  const taskPayload: GenerateStrategyPayload = {
    strategyId: strategy.id,
    userId,
    onboardingId: onboarding.id,
  };
  await tasks.trigger("generate-strategy", taskPayload);

  return {
    ok: true,
    userId,
    strategyId: strategy.id,
    deduped: false,
    inviteSent,
    inviteError,
  };
}
