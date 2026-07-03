"use server";

import { randomBytes } from "crypto";
import { Resend } from "resend";
import type { User } from "@supabase/supabase-js";
import { getActiveClient } from "@/lib/activeClient";
import { createAdminClient } from "@/lib/supabase/admin";

export interface CreateClientAccountResult {
  userId: string;
  /** True if the auth user already existed and we reused it (get-or-create). */
  alreadyExisted: boolean;
  /** True if the set-password email was dispatched via Resend. */
  inviteSent: boolean;
  /** Populated when inviteSent is false — the account exists, resend later. */
  inviteError?: string;
}

/** Branded set-password email. Inline styles — email clients ignore <style>. */
function inviteEmailHtml(name: string, url: string): string {
  const hi = name ? `Hi ${name},` : "Hi,";
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:8px 4px;color:#1a1a1a">
  <p style="font-size:15px;line-height:1.5">${hi}</p>
  <p style="font-size:15px;line-height:1.5">Your Rumi account is ready. Set your password to get in:</p>
  <p style="margin:24px 0">
    <a href="${url}" style="background:#0f0f0f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block">Set your password</a>
  </p>
  <p style="font-size:13px;line-height:1.5;color:#666">If the button doesn't work, paste this link into your browser:<br><span style="word-break:break-all;color:#8a6d1a">${url}</span></p>
  <p style="font-size:13px;line-height:1.5;color:#666">This link is single-use and expires. If it has, use “Forgot password?” on the sign-in page to get a fresh one.</p>
</div>`;
}

/**
 * Look up an existing auth user by email. supabase-js has no server-side
 * email filter on listUsers, so we page through. Fine at Rumi's scale
 * (tens of users); revisit if the auth user count grows large.
 */
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
 * Invite-only account creation. Admin-only.
 *
 * 1. Verifies the caller is an admin (getActiveClient re-checks the session —
 *    never trust the client).
 * 2. Get-or-creates the auth user with a cryptographically random password
 *    (never a guessable pattern) via the service role, email pre-confirmed.
 * 3. Upserts the profiles row as an active client.
 * 4. Builds a token_hash set-password link and emails it via Resend, so
 *    onboarding does NOT depend on the Supabase email-template config. The
 *    link lands on /auth/callback, which verifyOtp()s the token_hash (no
 *    browser PKCE verifier needed) and forwards to /update-password.
 *
 * This is the same pattern /api/intake will reuse for GHL-driven onboarding.
 */
export async function createClientAccount(
  email: string,
  name: string
): Promise<CreateClientAccountResult> {
  const ctx = await getActiveClient();
  if (!ctx || ctx.viewer.role !== "admin") {
    throw new Error("Not authorized: admin only.");
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    throw new Error("A valid email is required.");
  }
  const cleanName = name.trim();

  const admin = createAdminClient();

  // ── Get-or-create the auth user ──────────────────────────────────────
  let userId: string;
  let alreadyExisted = false;

  const randomPassword = randomBytes(32).toString("base64url");
  const { data: created, error: createErr } =
    await admin.auth.admin.createUser({
      email: cleanEmail,
      password: randomPassword,
      email_confirm: true,
      user_metadata: cleanName ? { name: cleanName } : undefined,
    });

  if (createErr) {
    // Most likely the user already exists — reuse it (get-or-create).
    const existing = await findAuthUserByEmail(admin, cleanEmail);
    if (!existing) {
      throw new Error(`Could not create user: ${createErr.message}`);
    }
    userId = existing.id;
    alreadyExisted = true;
  } else {
    userId = created.user.id;
  }

  // ── Ensure a complete, active client profile ─────────────────────────
  // This project has a trigger that already inserts a profiles row (role
  // 'client', email, onboarding_complete=false) the moment the auth user is
  // created — but it does NOT capture name. So we can't rely on a single
  // upsert: INSERT the full row for the trigger-absent case, and on conflict
  // MERGE only name/email/account_status. Role is never overwritten, so
  // re-inviting an existing admin can't demote them to client.
  const { error: insErr } = await admin.from("profiles").insert({
    id: userId,
    email: cleanEmail,
    name: cleanName || null,
    role: "client",
    account_status: "active",
  });
  if (insErr) {
    // Row already existed (trigger or a prior invite). Merge non-role fields;
    // only set name when we were given one (don't blank an existing name).
    const patch: Record<string, unknown> = {
      email: cleanEmail,
      account_status: "active",
    };
    if (cleanName) patch.name = cleanName;
    const { error: updErr } = await admin
      .from("profiles")
      .update(patch)
      .eq("id", userId);
    if (updErr) {
      throw new Error(`Could not write profile: ${updErr.message}`);
    }
  }

  // ── Build the set-password link and email it via Resend ──────────────
  // generateLink only *generates* the token — it does not send an email — so
  // we own delivery. We hand-build the /auth/callback URL from the returned
  // hashed_token rather than using the Supabase action_link (which routes
  // through Supabase's verify endpoint and needs template/PKCE handling).
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  let inviteSent = false;
  let inviteError: string | undefined;

  const { data: linkData, error: genErr } =
    await admin.auth.admin.generateLink({
      type: "recovery",
      email: cleanEmail,
      options: { redirectTo: `${siteUrl}/auth/callback?next=/update-password` },
    });

  const hashedToken = linkData?.properties?.hashed_token;
  if (genErr || !hashedToken) {
    inviteError =
      genErr?.message ?? "Could not generate the set-password link.";
  } else {
    const inviteUrl =
      `${siteUrl}/auth/callback` +
      `?token_hash=${encodeURIComponent(hashedToken)}` +
      `&type=recovery&next=/update-password`;

    const from = process.env.RESEND_FROM;
    if (!process.env.RESEND_API_KEY || !from) {
      inviteError =
        "Email not configured — set RESEND_API_KEY and RESEND_FROM (a verified sender).";
    } else {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { error: sendErr } = await resend.emails.send({
        from,
        to: cleanEmail,
        subject: "Set up your Rumi account",
        html: inviteEmailHtml(cleanName, inviteUrl),
      });
      if (sendErr) inviteError = sendErr.message;
      else inviteSent = true;
    }
  }

  return { userId, alreadyExisted, inviteSent, inviteError };
}
