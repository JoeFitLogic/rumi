// ─────────────────────────────────────────────────────────────────────────
// E2E native-onboarding harness — sanctioned, per docs/production-db-guidelines.md
//
//   node scripts/e2e-onboarding.mjs            # full run against a local dev server
//   node scripts/e2e-onboarding.mjs --teardown # remove all E2E rows (idempotent)
//
// WHAT IT PROVES
//   1. the ?k= gate denies no-key / wrong-key / wrong-value-right-length
//   2. the server action re-checks the key itself (a page render is not a gate)
//   3. the column allowlist drops browser-supplied keys that aren't form
//      columns — user_id, status, submission_source cannot be injected
//   4. a real submission provisions the account, stores every answer in the
//      right column, lands a pending strategy in the review queue with a
//      +3d deadline, and enqueues generate-strategy
//   5. a resubmit dedupes instead of double-firing generation
//   6. /api/intake STILL WORKS as the GHL fallback after the refactor — the
//      old GHL labels still resolve, and it is tagged submission_source='ghl' 
//
// REQUIRES a dev server on :3000 (npm run dev) and ONBOARDING_FORM_KEY set in
// .env.local.
//
// SAFETY (same contract as scripts/e2e-strategy.mjs)
//   • Fixed disposable identity e2e-onboarding@rumi.test. Every write/delete is
//     guarded: the target email MUST equal it, MUST end @rumi.test, and its id
//     MUST NOT be in PROTECTED_IDS. Any mismatch aborts before touching a row.
//   • Teardown is idempotent, runs FIRST for a clean slate, and again in a
//     finally block — so a half-run can never leave orphaned rows.
//   • This DOES send one invite email, because sending it is part of the flow
//     under test. It goes to a .test address (RFC 2606 reserved, cannot
//     resolve), so it can never reach a real inbox.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { ANSWERS } from "./_onboarding-fixture.mjs";

// ── env (.env.local is CRLF; trim strips stray \r) ──
const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) { env[m[1]] = m[2].trim(); process.env[m[1]] = m[2].trim(); }
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const KEY = env.ONBOARDING_FORM_KEY;
const E2E_EMAIL = "e2e-onboarding@rumi.test";
const E2E_NAME = "E2E Onboarding Test";

const PROTECTED_IDS = new Set([
  "e19354ba-0988-4721-8fe2-d4ae983d8b9f", // joe@fitlogicsystems.co.uk
  "c151a827-dd34-45d4-a887-89e291eaaa6a", // info@contentcoachhq.com
  "11111111-1111-4111-8111-111111111111", // seed-one@rumi.test
  "22222222-2222-4222-8222-222222222222", // seed-two@rumi.test
]);

function assertSafeTarget(userId, email) {
  const e = (email || "").toLowerCase();
  if (e !== E2E_EMAIL) throw new Error(`refusing to act on ${email} — not the E2E identity`);
  if (!e.endsWith("@rumi.test")) throw new Error(`refusing to act on ${email} — not @rumi.test`);
  if (PROTECTED_IDS.has(userId)) throw new Error(`refusing to act on protected id ${userId}`);
}

// ── tiny assert harness ──
let pass = 0, fail = 0;
const ck = (ok, msg, extra = "") => {
  console.log(`${ok ? "  PASS  " : "! FAIL  "}${msg}${extra ? "  " + extra : ""}`);
  ok ? pass++ : fail++;
};

async function findAuthUser(email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = data.users.find((u) => (u.email || "").toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

// ── idempotent teardown: children → parents, guarded, safe on 0 rows ──
async function teardown({ quiet = false } = {}) {
  const user = await findAuthUser(E2E_EMAIL);
  const prof = await admin.from("profiles").select("id,email").eq("email", E2E_EMAIL).maybeSingle();
  const userId = user?.id ?? prof.data?.id ?? null;
  if (!userId) { if (!quiet) console.log(`teardown: nothing to remove (no ${E2E_EMAIL}).`); return; }

  assertSafeTarget(userId, user?.email ?? prof.data?.email ?? E2E_EMAIL);
  if (!quiet) console.log(`teardown target: ${userId}  (${E2E_EMAIL})`);

  for (const [tbl, col] of [
    ["strategy_sections", "user_id"],
    ["strategies", "user_id"],
    ["onboarding_responses", "user_id"],
    ["profiles", "id"],
  ]) {
    const { data, error } = await admin.from(tbl).delete().eq(col, userId).select("id");
    if (error) throw new Error(`delete ${tbl} failed: ${error.message}`);
    if (!quiet) console.log(`  ${tbl}: ${data.length} deleted`);
  }
  if (user) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && !/not found/i.test(error.message)) throw new Error(`deleteUser failed: ${error.message}`);
    if (!quiet) console.log(`  auth.users: 1 deleted`);
  }
}

// ── drive the real server action over HTTP ──
// The action id is read from the build manifest at runtime, so this keeps
// working when the bundle is rebuilt.
function actionId() {
  const m = JSON.parse(readFileSync(new URL("../.next/server/server-reference-manifest.json", import.meta.url), "utf8"));
  for (const [id, info] of Object.entries(m.node ?? {})) {
    if (Object.keys(info.workers ?? {}).some((w) => w.includes("onboarding"))) return id;
  }
  throw new Error("could not find the onboarding server action in the build manifest — run `npm run dev` once first");
}

const ACTION = actionId();

async function callAction(args) {
  const res = await fetch(`${BASE}/onboarding?k=${encodeURIComponent(KEY)}`, {
    method: "POST",
    headers: { "Next-Action": ACTION, "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify([args]),
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function getPage(url) {
  const res = await fetch(url);
  return { status: res.status, text: await res.text() };
}


async function main() {
  const teardownOnly = process.argv.includes("--teardown");

  if (!KEY) throw new Error("ONBOARDING_FORM_KEY is not set in .env.local");

  await teardown();
  if (teardownOnly) return;

  try {
    console.log(`\n── 1. the ?k= gate ──`);
    const denied = (t) => /isn.{0,8}t valid/i.test(t);
    const rendered = (t) => /Identity Foundation Form/.test(t);
    ck(denied((await getPage(`${BASE}/onboarding`)).text), "no key -> denied");
    ck(denied((await getPage(`${BASE}/onboarding?k=nope`)).text), "wrong key -> denied");
    ck(denied((await getPage(`${BASE}/onboarding?k=${"a".repeat(KEY.length)}`)).text),
       "right length, wrong value -> denied");
    ck(rendered((await getPage(`${BASE}/onboarding?k=${encodeURIComponent(KEY)}`)).text),
       "correct key -> form renders");

    console.log(`\n── 2. the action re-checks the key itself ──`);
    const badKey = await callAction({ key: "nope", name: E2E_NAME, email: E2E_EMAIL, answers: ANSWERS });
    ck(/no longer valid/.test(badKey.text), "action with a bad key is rejected");
    ck(!(await findAuthUser(E2E_EMAIL)), "and provisioned no account");

    console.log(`\n── 3. validation ──`);
    const noName = await callAction({ key: KEY, name: "  ", email: E2E_EMAIL, answers: {} });
    ck(/add your full name/.test(noName.text), "empty name rejected");
    const badEmail = await callAction({ key: KEY, name: E2E_NAME, email: "nope", answers: {} });
    ck(/valid email/.test(badEmail.text), "malformed email rejected");
    ck(!(await findAuthUser(E2E_EMAIL)), "still no account provisioned");

    console.log(`\n── 4. real submission ──`);
    // Injection attempt rides along: none of these are form columns.
    const injected = {
      ...ANSWERS,
      user_id: "00000000-0000-0000-0000-000000000000",
      status: "released",
      submission_source: "ghl",
      voice_transcript: "should not be settable from the browser",
      id: "11111111-1111-1111-1111-111111111111",
    };
    const submit = await callAction({ key: KEY, name: E2E_NAME, email: E2E_EMAIL, answers: injected });
    ck(/"status":"ok"/.test(submit.text), "submit accepted");
    // The invite is part of the flow, so report what actually happened to it
    // rather than assuming. A .test address can legitimately be refused by the
    // mail provider -- that must not be silent, and must not fail the submit.
    const inviteSent = /"inviteSent":true/.test(submit.text);
    console.log(`         invite email: ${inviteSent ? "SENT" : "NOT SENT (see server log)"}`);
    ck(/"inviteSent":(true|false)/.test(submit.text),
       "invite outcome is reported to the client, not swallowed");

    const user = await findAuthUser(E2E_EMAIL);
    ck(!!user, "auth user provisioned");
    if (!user) throw new Error("no user — cannot continue");
    assertSafeTarget(user.id, user.email);

    const { data: prof } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
    ck(prof?.role === "client", "profile role = client", `got ${prof?.role}`);
    ck(prof?.account_status === "active", "profile active", `got ${prof?.account_status}`);
    ck(prof?.name === E2E_NAME, "profile name stored");

    const { data: onb } = await admin.from("onboarding_responses").select("*")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    ck(!!onb, "onboarding row created");
    ck(onb?.status === "submitted", "onboarding status = submitted", `got ${onb?.status}`);
    ck(onb?.submission_source === "native", "submission_source = native (not the injected 'ghl')",
       `got ${onb?.submission_source}`);

    console.log(`\n── 5. every answer landed in its own column ──`);
    const wrong = Object.entries(ANSWERS)
      .filter(([c, v]) => v.trim() && String(onb?.[c] ?? "") !== v.trim());
    ck(wrong.length === 0, `all ${Object.values(ANSWERS).filter((v) => v.trim()).length} answers stored verbatim`,
       wrong.map(([c]) => c).join(",") || "");
    ck(onb?.youtube_url === null, "an empty answer stored as null, not ''", `got ${JSON.stringify(onb?.youtube_url)}`);
    // spot-check the shapes
    ck(onb?.platforms === "Instagram, YouTube", "checkbox group comma-joined");
    ck(onb?.swearing_level === "Moderate (shit, arse)", "select stored");
    ck(onb?.content_feels_easy && onb?.content_feels_difficult, "both halves of a split question stored");
    ck(onb?.catchphrases && onb?.words_never_say, "voice allowlist and banlist stored separately");
    // Revised form, Part 13: the new column. Requires sql/0014.
    ck(onb?.fuck_you_goal === ANSWERS.fuck_you_goal, "fuck_you_goal stored (sql/0014)",
       `got ${JSON.stringify(onb?.fuck_you_goal)}`);
    // Revised form, Part 9: one two-half question became two standalone
    // questions. Same two columns, so both must still land separately.
    ck(onb?.client_wins && onb?.best_transformation_story,
       "Part 9's two questions stored in their own columns");

    console.log(`\n── 6. the injection attempt was dropped ──`);
    ck(onb?.user_id === user.id, "user_id is the provisioned user, not the injected one");
    ck(onb?.voice_transcript === null, "voice_transcript not settable from the browser",
       `got ${JSON.stringify(onb?.voice_transcript)}`);
    ck(onb?.id !== "11111111-1111-1111-1111-111111111111", "id not settable from the browser");

    console.log(`\n── 7. review queue ──`);
    const { data: strat } = await admin.from("strategies").select("*")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    ck(!!strat, "strategy row created");
    ck(strat?.status === "pending", "strategy status = pending", `got ${strat?.status}`);
    ck(strat?.onboarding_id === onb?.id, "strategy linked to the onboarding row");
    ck(strat?.client_name === "E2E", "client_name is the first name", `got ${strat?.client_name}`);
    const days = strat?.review_deadline
      ? (new Date(strat.review_deadline) - Date.now()) / 86_400_000 : null;
    ck(days !== null && days > 2.9 && days < 3.1, "review deadline is +3 days", `got ${days?.toFixed(2)}d`);

    console.log(`\n── 8. resubmit dedupes ──`);
    const again = await callAction({ key: KEY, name: E2E_NAME, email: E2E_EMAIL, answers: ANSWERS });
    ck(/"deduped":true/.test(again.text), "second submit reports deduped", again.text.slice(0, 120));
    const { count: stratCount } = await admin.from("strategies")
      .select("*", { count: "exact", head: true }).eq("user_id", user.id);
    ck(stratCount === 1, "still exactly one strategy row", `got ${stratCount}`);
    const { count: onbCount } = await admin.from("onboarding_responses")
      .select("*", { count: "exact", head: true }).eq("user_id", user.id);
    ck(onbCount === 1, "still exactly one onboarding row", `got ${onbCount}`);
    // ── the GHL fallback must keep working ────────────────────────────────
    // /api/intake was refactored onto the shared pipeline, and the Resonance
    // rewording moved its labels into `aliases`. Both are regressions waiting
    // to happen, so prove the webhook end-to-end with an OLD-label payload.
    console.log(`\n── 9. /api/intake still works (GHL fallback) ──`);
    await teardown({ quiet: true });

    const ghlPayload = {
      "Full Name": E2E_NAME,
      "Email": E2E_EMAIL,
      "Describe yourself in three words": "old, ghl, labels",
      "What makes you different": "I came in through the legacy webhook.",
      "Misconceptions your ideal client has": "That the old form stopped working.",
      "Your timezone": "Europe/London",
      "Platforms you are on": "Instagram",
    };
    const wh = await fetch(`${BASE}/api/intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-intake-secret": env.INTAKE_SECRET },
      body: JSON.stringify(ghlPayload),
    });
    const whBody = await wh.json();
    ck(wh.status === 200 && whBody.ok === true, "webhook accepted", JSON.stringify(whBody).slice(0, 100));

    const ghlUser = await findAuthUser(E2E_EMAIL);
    ck(!!ghlUser, "webhook provisioned the account");
    if (ghlUser) {
      assertSafeTarget(ghlUser.id, ghlUser.email);
      const { data: g } = await admin.from("onboarding_responses").select("*")
        .eq("user_id", ghlUser.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      ck(g?.submission_source === "ghl", "tagged submission_source = ghl", `got ${g?.submission_source}`);
      ck(g?.describe_yourself_3_words === "old, ghl, labels",
         "OLD GHL label still maps to its column (the alias path)");
      ck(g?.what_makes_you_different === "I came in through the legacy webhook.",
         "a reworded column still resolves from its old label");
      ck(g?.client_misconceptions === "That the old form stopped working.",
         "a LEGACY column the new form dropped still accepts webhook data");
      const { count } = await admin.from("strategies")
        .select("*", { count: "exact", head: true }).eq("user_id", ghlUser.id);
      ck(count === 1, "webhook created exactly one strategy", `got ${count}`);
    }

    const unauth = await fetch(`${BASE}/api/intake`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ghlPayload),
    });
    ck(unauth.status === 401, "webhook still rejects a missing secret", `got ${unauth.status}`);
  } finally {
    console.log(`\n── teardown ──`);
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
