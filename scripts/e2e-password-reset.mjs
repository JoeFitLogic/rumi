// ─────────────────────────────────────────────────────────────────────────
// E2E password-reset harness — sanctioned, per docs/production-db-guidelines.md
//
//   node scripts/e2e-password-reset.mjs            # full run (dev server on :3000)
//   node scripts/e2e-password-reset.mjs --teardown # remove E2E rows (idempotent)
//
// WHAT IT PROVES
//   1. the reset email's link points at NEXT_PUBLIC_SITE_URL, NOT at Cleo's
//      Site URL -- read back from Resend, not inferred from the code
//   2. the token in that link actually verifies (it is a usable link, not
//      just a well-shaped one)
//   3. no account is ever created by a reset request
//   4. the server action is non-enumerating: identical response for a real
//      address, an unknown one, and a malformed one
//
// WHY IT EXISTS
//   Rumi's reset used supabase.auth.resetPasswordForEmail. On this Cleo-shared
//   project, Supabase silently rewrites a redirectTo it has not allow-listed to
//   its own Site URL -- Cleo's domain -- so Rumi clients were emailed a link
//   that landed on Cleo. Silent, so only an assertion on the real email catches
//   a regression.
//
// SAFETY
//   Fixed disposable identity e2e-reset@rumi.test, guarded and torn down.
//   Sends two real emails to a .test address (RFC 2606, cannot resolve).
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync } from "fs";
import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  // Strip surrounding quotes: Next's dotenv does, this regex loader does not,
  // and RESEND_FROM is quoted ("Rumi <hello@...>"). Passing the quotes through
  // makes Resend reject the `from` field.
  if (m) {
    const v = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    env[m[1]] = v; process.env[m[1]] = v;
  }
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const SITE = env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const E2E_EMAIL = "e2e-reset@rumi.test";
const E2E_NAME = "E2E Reset Test";
const UNKNOWN = "e2e-reset-nobody@rumi.test";

const PROTECTED_IDS = new Set([
  "e19354ba-0988-4721-8fe2-d4ae983d8b9f",
  "c151a827-dd34-45d4-a887-89e291eaaa6a",
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
]);
function assertSafeTarget(id, email) {
  const e = (email || "").toLowerCase();
  if (e !== E2E_EMAIL) throw new Error(`refusing to act on ${email}`);
  if (!e.endsWith("@rumi.test")) throw new Error(`refusing: not @rumi.test`);
  if (PROTECTED_IDS.has(id)) throw new Error(`refusing: protected id`);
}

let pass = 0, fail = 0;
const ck = (ok, msg, extra = "") => {
  console.log(`${ok ? "  PASS  " : "! FAIL  "}${msg}${extra ? "  " + extra : ""}`);
  ok ? pass++ : fail++;
};

async function findAuthUser(email) {
  const t = email.toLowerCase();
  for (let p = 1; p <= 50; p++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: p, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => (u.email || "").toLowerCase() === t);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

async function teardown({ quiet = false } = {}) {
  for (const email of [E2E_EMAIL, UNKNOWN]) {
    const u = await findAuthUser(email);
    if (!u) continue;
    if (!(u.email || "").toLowerCase().endsWith("@rumi.test")) throw new Error("refusing");
    if (PROTECTED_IDS.has(u.id)) throw new Error("refusing: protected");
    await admin.from("profiles").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
    if (!quiet) console.log(`  removed ${email}`);
  }
  if (!quiet) console.log("teardown done");
}

/** Read the email back out of Resend so we assert on what was actually sent. */
async function resendEmail(id) {
  const res = await fetch(`https://api.resend.com/emails/${id}`, {
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
  });
  if (!res.ok) return null;
  return res.json();
}

const actionId = () => {
  const m = JSON.parse(readFileSync(new URL("../.next/server/server-reference-manifest.json", import.meta.url), "utf8"));
  for (const [id, info] of Object.entries(m.node ?? {}))
    if (Object.keys(info.workers ?? {}).some((w) => w.includes("reset-password"))) return id;
  throw new Error("reset-password action not in the build manifest — run `npm run dev` once");
};

async function callAction(email) {
  const res = await fetch(`${BASE}/reset-password`, {
    method: "POST",
    headers: { "Next-Action": actionId(), "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify([email]),
  });
  return { status: res.status, text: await res.text() };
}

async function main() {
  if (process.argv.includes("--teardown")) return teardown();
  await teardown({ quiet: true });

  try {
    console.log(`site url under test: ${SITE}\n`);

    // ── 1. the link in the real email ──────────────────────────────────
    console.log("── 1. what actually gets emailed ──");
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: E2E_EMAIL, password: randomBytes(32).toString("base64url"),
      email_confirm: true, user_metadata: { name: E2E_NAME },
    });
    if (cErr) throw new Error(`createUser: ${cErr.message}`);
    assertSafeTarget(created.user.id, created.user.email);

    const { sendPasswordResetEmail } = await import("../.tmp-reset-lib/provision.mjs");
    const r = await sendPasswordResetEmail(E2E_EMAIL);
    ck(r.sent === true, "reset email sent for an existing account", r.error ?? "");
    ck(Boolean(r.id), "Resend message id returned", r.id ?? "");

    if (r.id) {
      await new Promise((res) => setTimeout(res, 2500)); // let Resend store it
      const mail = await resendEmail(r.id);
      const html = mail?.html ?? "";
      const link = (html.match(/https?:\/\/[^"'\s<]+auth\/callback[^"'\s<]*/) || [])[0] ?? "";
      ck(Boolean(link), "email contains an /auth/callback link");
      ck(link.startsWith(SITE), `link points at NEXT_PUBLIC_SITE_URL, not Cleo`,
         link ? link.split("?")[0] : "");
      ck(!/cleo\.contentcoachhq\.com/i.test(html), "no Cleo domain anywhere in the email");
      ck(/token_hash=/.test(link) && /type=recovery/.test(link), "link carries token_hash + type=recovery");

      // 2. is the token actually usable?
      const tokenHash = new URLSearchParams(link.split("?")[1] ?? "").get("token_hash");
      const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });
      const { data: v, error: vErr } = await anon.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
      ck(!vErr && Boolean(v?.session), "the token in the email actually verifies", vErr?.message ?? "");
      ck(v?.user?.email === E2E_EMAIL, "and resolves to the right account");
    }

    // ── 3. never provisions ────────────────────────────────────────────
    console.log("\n── 2. a reset request never creates an account ──");
    const before = await findAuthUser(UNKNOWN);
    const r2 = await sendPasswordResetEmail(UNKNOWN);
    ck(r2.sent === false, "unknown address: nothing sent", r2.error ?? "");
    ck((await findAuthUser(UNKNOWN)) === null && before === null, "unknown address: no account created");

    // ── 4. non-enumerating action ──────────────────────────────────────
    console.log("\n── 3. the action gives nothing away ──");
    const real = await callAction(E2E_EMAIL);
    const unknown = await callAction(UNKNOWN);
    const malformed = await callAction("not-an-email");
    const body = (x) => x.text.replace(/[0-9a-f-]{20,}/gi, "").replace(/:N\d+\.\d+/g, "");
    ck(real.status === 200 && unknown.status === 200 && malformed.status === 200,
       "all three return 200", `${real.status}/${unknown.status}/${malformed.status}`);
    ck(body(real) === body(unknown), "real and unknown address are indistinguishable");
    ck(body(real) === body(malformed), "malformed address is indistinguishable too");
    ck(/"ok":true/.test(real.text), "action reports ok");
    ck((await findAuthUser(UNKNOWN)) === null, "still no account for the unknown address");
  } finally {
    console.log("\n── teardown ──");
    await teardown();
  }

  console.log(`\n${fail ? `${fail} FAILED, ${pass} passed` : `ALL ${pass} CHECKS PASSED`}`);
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error("\nHARNESS ERROR:", e.message);
  await teardown({ quiet: true }).catch(() => {});
  process.exit(1);
});
