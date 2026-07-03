// Ops script — create a Rumi account and send its set-password link, using the
// same logic as the createClientAccount server action (service role, random
// password, recovery email). Use it to bootstrap accounts that don't exist yet
// (e.g. businessconciergeagency@gmail.com), THEN run sql/0004_set_admins.sql to
// elevate them to admin.
//
// Prereqs: sql/0001 must be applied first (needs the account_status column).
// Sends a REAL email via the project's SMTP — run deliberately.
//
//   node scripts/bootstrap-admin.mjs "email@example.com" "Full Name"
//
import { readFileSync } from "fs";
import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const [, , emailArg, ...nameParts] = process.argv;
if (!emailArg) {
  console.error('Usage: node scripts/bootstrap-admin.mjs "email" "Full Name"');
  process.exit(1);
}
const email = emailArg.trim().toLowerCase();
const name = nameParts.join(" ").trim();

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const siteUrl = env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// 1. get-or-create the auth user with a random password
let userId;
const { data: created, error: ce } = await admin.auth.admin.createUser({
  email, password: randomBytes(32).toString("base64url"), email_confirm: true,
  user_metadata: name ? { name } : undefined,
});
if (ce) {
  console.log("createUser said:", ce.message, "— looking up existing user…");
  for (let page = 1; page <= 50; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const hit = data.users.find((u) => (u.email || "").toLowerCase() === email);
    if (hit) { userId = hit.id; break; }
    if (data.users.length < 200) break;
  }
  if (!userId) { console.error("Could not create or find user."); process.exit(1); }
} else {
  userId = created.user.id;
}
console.log("user id:", userId);

// 2. ensure a complete, active profile without demoting an existing role
const { error: insErr } = await admin.from("profiles").insert({
  id: userId, email, name: name || null, role: "client", account_status: "active",
});
if (insErr) {
  const patch = { email, account_status: "active" };
  if (name) patch.name = name;
  const { error: uErr } = await admin.from("profiles").update(patch).eq("id", userId);
  if (uErr) { console.error("profile update failed:", uErr.message); process.exit(1); }
  console.log("profile merged (row already existed).");
} else {
  console.log("profile inserted.");
}

// 3. build the token_hash set-password link and email it via Resend
const { data: linkData, error: ge } = await admin.auth.admin.generateLink({
  type: "recovery", email,
  options: { redirectTo: `${siteUrl}/auth/callback?next=/update-password` },
});
if (ge || !linkData?.properties?.hashed_token) {
  console.error("generateLink failed:", ge?.message); process.exit(1);
}
const inviteUrl = `${siteUrl}/auth/callback?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=recovery&next=/update-password`;
if (!env.RESEND_API_KEY || !env.RESEND_FROM) {
  console.log("\nRESEND_API_KEY/RESEND_FROM not set — no email sent. Set-password link:\n" + inviteUrl);
} else {
  const resend = new Resend(env.RESEND_API_KEY);
  const { error: se } = await resend.emails.send({
    from: env.RESEND_FROM, to: email, subject: "Set up your Rumi account",
    html: `<p>Your Rumi account is ready. Set your password:</p><p><a href="${inviteUrl}">Set your password</a></p><p style="word-break:break-all">${inviteUrl}</p>`,
  });
  console.log(se ? "invite email FAILED: " + se.message : "invite email sent to " + email);
}
console.log("\nNext: run sql/0004_set_admins.sql to elevate this account to admin.");
