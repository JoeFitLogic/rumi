import "server-only";
import { randomBytes } from "crypto";
import { Resend } from "resend";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// Shared invite-only account provisioning, used by BOTH the admin
// createClientAccount action and the /api/intake webhook. Service-role only.
// (The webhook is authenticated by INTAKE_SECRET, not a session, so it can't
// call the admin-gated action — both reuse this pattern instead.)

export interface ProvisionResult {
  userId: string;
  alreadyExisted: boolean;
  inviteSent: boolean;
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
}): Promise<ProvisionResult> {
  const cleanEmail = opts.email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    throw new Error("A valid email is required.");
  }
  const cleanName = opts.name.trim();
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

  // ── ensure a complete, active client profile (never demote a role) ───
  const { error: insErr } = await admin.from("profiles").insert({
    id: userId,
    email: cleanEmail,
    name: cleanName || null,
    role: "client",
    account_status: "active",
  });
  if (insErr) {
    const patch: Record<string, unknown> = {
      email: cleanEmail,
      account_status: "active",
    };
    if (cleanName) patch.name = cleanName;
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
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  let inviteSent = false;
  let inviteError: string | undefined;

  const { data: linkData, error: genErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: cleanEmail,
    options: { redirectTo: `${siteUrl}/auth/callback?next=/update-password` },
  });
  const hashedToken = linkData?.properties?.hashed_token;
  if (genErr || !hashedToken) {
    inviteError = genErr?.message ?? "Could not generate the set-password link.";
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
