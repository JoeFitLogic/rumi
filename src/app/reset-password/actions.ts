"use server";

import { sendPasswordResetEmail } from "@/lib/provision";

// Password reset for Rumi, sent by us rather than by Supabase.
//
// WHY NOT supabase.auth.resetPasswordForEmail:
//   This Supabase project is shared with Cleo, so its Site URL is Cleo's
//   domain and Rumi's domain is not in the redirect allow-list. A redirectTo
//   pointing at Rumi is silently rewritten to Cleo's Site URL — verified: it
//   behaves identically to a made-up domain, with no error. So Supabase's own
//   reset email lands Rumi clients on Cleo. Since the invite email tells them
//   to use "Forgot password?" when their single-use link expires, that was the
//   documented recovery path from an expired invite.
//
//   sendPasswordResetEmail takes only the hashed_token and builds the URL from
//   NEXT_PUBLIC_SITE_URL, which is immune to both.

/** Best-effort per-email cooldown.
 *
 *  Replaces the rate limiting Supabase used to do for us. It is in-process, so
 *  on serverless it only throttles repeats that land on the same warm
 *  instance — real, but partial. Resend's own account limits are the backstop.
 *  A durable limit would need a table, which is not worth a migration for a
 *  page behind an email address. Deliberately does NOT change the response:
 *  a throttled request looks exactly like a sent one, or it would leak which
 *  addresses are real. */
const COOLDOWN_MS = 60_000;
const MAX_TRACKED = 5_000;
const lastSent = new Map<string, number>();

function onCooldown(email: string): boolean {
  const now = Date.now();
  for (const [k, t] of lastSent) if (now - t > COOLDOWN_MS) lastSent.delete(k);
  if (lastSent.size > MAX_TRACKED) lastSent.clear(); // hard bound, never grows
  const prev = lastSent.get(email);
  if (prev !== undefined && now - prev < COOLDOWN_MS) return true;
  lastSent.set(email, now);
  return false;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Always resolves the same way, whether or not the address has an account.
 * The page shows "if an account exists…", and this must not contradict it:
 * a distinguishable response here would turn the page into an account
 * enumerator.
 */
export async function requestPasswordReset(
  email: string
): Promise<{ ok: true }> {
  const clean = String(email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(clean)) return { ok: true };
  if (onCooldown(clean)) return { ok: true };

  const { sent, error } = await sendPasswordResetEmail(clean);
  if (!sent) {
    // Logged, never returned. "No account for that address" is the expected
    // case for a typo and is not worth alarming about; anything else is a
    // real delivery problem worth seeing in the Vercel logs.
    console.error(`[reset-password] not sent to ${clean}: ${error}`);
  }
  return { ok: true };
}
