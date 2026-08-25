import "server-only";
import { randomBytes } from "crypto";
import { Resend } from "resend";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/types";

// Shared invite-only account provisioning, used by BOTH the admin
// createClientAccount action and the /api/intake webhook. Service-role only.
// (The webhook is authenticated by INTAKE_SECRET, not a session, so it can't
// call the admin-gated action — both reuse this pattern instead.)

export interface ProvisionResult {
  userId: string;
  alreadyExisted: boolean;
  inviteSent: boolean;
  inviteError?: string;
  /** Resend message id, when an invite was sent. For chasing delivery. */
  inviteId?: string;
}

/** Branded set-password email. Inline styles — email clients ignore <style>.
 *
 *  Carries three things the first version left out, each of which generated a
 *  "how do I get back in?" reply:
 *    • the sign-in URL, so they have something to bookmark once the single-use
 *      link is spent (it previously pointed them at a "sign-in page" they had
 *      no address for)
 *    • their email named as the username
 *    • what happens next, so a client who has just spent hours on the form
 *      isn't left wondering whether anything is coming */
function inviteEmailHtml(name: string, url: string, email: string): string {
  const hi = name ? `Hi ${name},` : "Hi,";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const loginUrl = `${siteUrl}/login`;
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:8px 4px;color:#1a1a1a">
  <p style="font-size:15px;line-height:1.5">${hi}</p>
  <p style="font-size:15px;line-height:1.5">Thanks for filling in your Identity Foundation Form. Your Rumi account is ready — set your password and you're in:</p>
  <p style="margin:24px 0">
    <a href="${url}" style="background:#ab8115;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block">Set your password</a>
  </p>
  <p style="font-size:13px;line-height:1.5;color:#666">If the button doesn't work, paste this link into your browser:<br><span style="word-break:break-all;color:#7a6200">${url}</span></p>
  <p style="font-size:15px;line-height:1.5;margin-top:24px"><strong>What happens next</strong><br>Niamh is building your personal brand and growth strategy from your answers. It'll appear in Rumi when it's ready, and we'll email you the moment it does.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#f4f1ea;border-radius:8px;width:100%">
    <tr><td style="padding:14px 16px;font-size:13px;line-height:1.6;color:#4a453e">
      <strong style="color:#1a1a1a">Signing in from now on</strong><br>
      Go to <a href="${loginUrl}" style="color:#7a6200;word-break:break-all">${loginUrl}</a><br>
      Your username is <strong style="color:#1a1a1a">${email}</strong>
    </td></tr>
  </table>
  <p style="font-size:13px;line-height:1.5;color:#666">The link above is single-use and expires. If it has, use “Forgot password?” on the sign-in page and we'll send a fresh one.</p>
  <hr style="border:none;border-top:1px solid #eae0c5;margin:28px 0 14px">
  <p style="color:#6b655c;font-size:12px;margin:0"><strong style="color:#7a6200">Rumi</strong> — by Resonance · Connect. Convert.</p>
</div>`;
}

/** Password-reset email. Same shape as the invite, different promise. */
function resetEmailHtml(name: string, url: string): string {
  const hi = name ? `Hi ${name},` : "Hi,";
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:8px 4px;color:#1a1a1a">
  <p style="font-size:15px;line-height:1.5">${hi}</p>
  <p style="font-size:15px;line-height:1.5">Someone asked to reset the password for your Rumi account. If that was you, set a new one here:</p>
  <p style="margin:24px 0">
    <a href="${url}" style="background:#ab8115;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block">Choose a new password</a>
  </p>
  <p style="font-size:13px;line-height:1.5;color:#666">If the button doesn't work, paste this link into your browser:<br><span style="word-break:break-all;color:#7a6200">${url}</span></p>
  <p style="font-size:13px;line-height:1.5;color:#666">This link is single-use and expires. If you didn't ask for this, you can ignore this email and your password stays as it is.</p>
  <hr style="border:none;border-top:1px solid #eae0c5;margin:28px 0 14px">
  <p style="color:#6b655c;font-size:12px;margin:0"><strong style="color:#7a6200">Rumi</strong> — by Resonance · Connect. Convert.</p>
</div>`;
}

/**
 * Generate a single-use recovery token and email a link to OUR OWN
 * /auth/callback, via Resend.
 *
 * ⚠️ The hand-built URL is the whole point, not an incidental detail. This
 * Supabase project is shared with Cleo, so its Site URL is Cleo's domain and
 * Rumi's domain is NOT in the redirect allow-list. Verified empirically: a
 * `redirectTo` pointing at Rumi is silently REWRITTEN to Cleo's Site URL,
 * exactly as a made-up domain would be — no error, no warning. So anything
 * that relies on Supabase's own email (resetPasswordForEmail) or on
 * `properties.action_link` sends Rumi users to Cleo.
 *
 * Taking only `properties.hashed_token` and building the URL from
 * NEXT_PUBLIC_SITE_URL sidesteps both the allow-list and the shared Site URL.
 * /auth/callback verifies the token server-side with verifyOtp.
 *
 * Never throws on a send failure: it reports it, so a caller that has already
 * done real work (provisioning an account) is not rolled back by a mail
 * problem.
 */
async function sendRecoveryLink(opts: {
  email: string;
  name: string;
  subject: string;
  html: (url: string) => string;
}): Promise<{ sent: boolean; error?: string; id?: string }> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const admin = createAdminClient();

  const { data: linkData, error: genErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: opts.email,
    options: { redirectTo: `${siteUrl}/auth/callback?next=/update-password` },
  });
  const hashedToken = linkData?.properties?.hashed_token;
  if (genErr || !hashedToken) {
    return {
      sent: false,
      error: genErr?.message ?? "Could not generate the set-password link.",
    };
  }

  const url =
    `${siteUrl}/auth/callback` +
    `?token_hash=${encodeURIComponent(hashedToken)}` +
    `&type=recovery&next=/update-password`;

  const from = process.env.RESEND_FROM;
  if (!process.env.RESEND_API_KEY || !from) {
    return {
      sent: false,
      error:
        "Email not configured — set RESEND_API_KEY and RESEND_FROM (a verified sender).",
    };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error: sendErr } = await resend.emails.send({
    from,
    to: opts.email,
    subject: opts.subject,
    html: opts.html(url),
  });
  // The Resend message id is returned (never the URL, which is a live
  // credential) so a delivery question can be chased in the Resend dashboard.
  return sendErr
    ? { sent: false, error: sendErr.message }
    : { sent: true, id: data?.id };
}

/**
 * Send a password-reset link to an EXISTING account.
 *
 * Deliberately never reveals whether the account exists — the caller returns
 * the same response either way. A missing account makes generateLink fail,
 * which is reported here and swallowed by the caller.
 *
 * Never creates an account: unlike provisionClientAccount, this only ever
 * mails an existing one.
 */
export async function sendPasswordResetEmail(
  email: string
): Promise<{ sent: boolean; error?: string; id?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { sent: false, error: "A valid email is required." };
  }
  const admin = createAdminClient();
  const existing = await findAuthUserByEmail(admin, cleanEmail);
  if (!existing) return { sent: false, error: "No account for that address." };

  const name =
    (existing.user_metadata?.name as string | undefined)?.trim() ?? "";

  return sendRecoveryLink({
    email: cleanEmail,
    name,
    subject: "Reset your Rumi password",
    html: (url) => resetEmailHtml(name, url),
  });
}

/** Page through auth users to find one by email (supabase-js has no filter). */
async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string
): Promise<User | null> {
  const target = email.toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match;
    if (data.users.length < perPage) break;
  }
  return null;
}

/**
 * Get-or-create an auth user (random password), ensure a complete active
 * client profile without demoting an existing role, and optionally email a
 * token_hash set-password link via Resend.
 */
export async function provisionClientAccount(opts: {
  email: string;
  name: string;
  sendInvite?: boolean;
  /** Role for a freshly-created account. Defaults to "client". Never demotes
   *  an account that already exists (its existing role is preserved). */
  role?: Role;
  /** Set profiles.linked_user_id (used to attach a VA to a client). */
  linkedUserId?: string | null;
}): Promise<ProvisionResult> {
  const cleanEmail = opts.email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    throw new Error("A valid email is required.");
  }
  const cleanName = opts.name.trim();
  const role: Role = opts.role ?? "client";
  const admin = createAdminClient();

  // ── get-or-create the auth user ──────────────────────────────────────
  let userId: string;
  let alreadyExisted = false;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: cleanEmail,
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
    user_metadata: cleanName ? { name: cleanName } : undefined,
  });
  if (createErr) {
    const existing = await findAuthUserByEmail(admin, cleanEmail);
    if (!existing) throw new Error(`Could not create user: ${createErr.message}`);
    userId = existing.id;
    alreadyExisted = true;
  } else {
    userId = created.user.id;
  }

  // ── ensure a complete, active profile (never demote a role) ─────────
  // Role is only set on a fresh insert. If the account already exists we patch
  // email/name/status/link but deliberately leave role untouched, so
  // re-provisioning can never demote an admin (or change a client to a VA).
  const { error: insErr } = await admin.from("profiles").insert({
    id: userId,
    email: cleanEmail,
    name: cleanName || null,
    role,
    account_status: "active",
    linked_user_id: opts.linkedUserId ?? null,
  });
  if (insErr) {
    const patch: Record<string, unknown> = {
      email: cleanEmail,
      account_status: "active",
    };
    if (cleanName) patch.name = cleanName;
    if (opts.linkedUserId !== undefined) patch.linked_user_id = opts.linkedUserId;
    const { error: updErr } = await admin
      .from("profiles")
      .update(patch)
      .eq("id", userId);
    if (updErr) throw new Error(`Could not write profile: ${updErr.message}`);
  }

  if (!opts.sendInvite) {
    return { userId, alreadyExisted, inviteSent: false };
  }

  // ── build the token_hash set-password link + email it via Resend ─────
  // Shares sendRecoveryLink with the password-reset flow, so the two can't
  // drift apart on the thing that matters: never trusting Supabase's Site URL
  // or its redirect handling on this Cleo-shared project.
  const {
    sent: inviteSent,
    error: inviteError,
    id: inviteId,
  } = await sendRecoveryLink({
    email: cleanEmail,
    name: cleanName,
    subject: "Set up your Rumi account",
    html: (url) => inviteEmailHtml(cleanName, url, cleanEmail),
  });

  return { userId, alreadyExisted, inviteSent, inviteError, inviteId };
}
