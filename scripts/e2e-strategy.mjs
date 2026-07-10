// ─────────────────────────────────────────────────────────────────────────
// E2E strategy-pipeline harness — sanctioned, per docs/production-db-guidelines.md
//
//   node scripts/e2e-strategy.mjs            # --run  (default): fixture, NO API cost
//   node scripts/e2e-strategy.mjs --live     # real generate-strategy (Anthropic $$)
//   node scripts/e2e-strategy.mjs --teardown # remove all E2E rows (idempotent)
//
// WHY THIS EXISTS
//   Session-3 E2E hand-rolled a throwaway that used joe+e2e-jordan@fitlogicsystems
//   .co.uk — a +alias of a REAL admin account — which violates the "@rumi.test
//   only" rule and once contributed to a lockout. This is the committed,
//   correct replacement: one fixed disposable @rumi.test identity, and a
//   teardown that both modes share.
//
// IDENTITY (fixed & deterministic)
//   email : e2e-strategy@rumi.test   ← THE stable key. get-or-create by email.
//   The Supabase GoTrue admin API assigns the auth UUID; it can't be pinned from
//   JS (only a raw INSERT into auth.users could, like sql/0005). So the *email*
//   is the fixed identity and the UUID is resolved at runtime — stable for the
//   account's lifetime, so re-runs never pile up duplicates.
//
// SAFETY
//   • Every write/delete is guarded: the target email MUST end with @rumi.test
//     and MUST equal E2E_EMAIL, and its id MUST NOT be in PROTECTED. Any mismatch
//     aborts before touching a row.
//   • Teardown is idempotent (safe on 0 rows) and runs FIRST in --run/--live for a
//     clean slate, and again automatically if seeding throws — so a half-run can
//     never leave orphaned rows.
//   • No invite email is sent (a @rumi.test address would only bounce).
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync } from "fs";
import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";

// ── env (.env.local is CRLF; trim strips stray \r). Also mirror into
//    process.env so @trigger.dev/sdk picks up TRIGGER_SECRET_KEY in --live. ──
const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) { env[m[1]] = m[2].trim(); process.env[m[1]] = m[2].trim(); }
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── fixed disposable identity ──
const E2E_EMAIL = "e2e-strategy@rumi.test";
const E2E_NAME = "E2E Strategy Test";
const REVIEW_WINDOW_DAYS = 3;

// ── accounts that must NEVER be touched (belt-and-braces denylist) ──
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

// ── page through auth users to find one by email (no server-side filter) ──
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

async function countOwned(userId) {
  const one = async (tbl, col) => {
    const { count, error } = await admin.from(tbl).select("*", { count: "exact", head: true }).eq(col, userId);
    return error ? `ERR:${error.message}` : count;
  };
  return {
    strategy_sections: await one("strategy_sections", "user_id"),
    strategies: await one("strategies", "user_id"),
    onboarding_responses: await one("onboarding_responses", "user_id"),
    profiles: await one("profiles", "id"),
  };
}

// ── idempotent teardown: children → parents, guarded, safe on 0 rows ──
async function teardown({ quiet = false } = {}) {
  const user = await findAuthUser(E2E_EMAIL);
  const prof = await admin.from("profiles").select("id,email").eq("email", E2E_EMAIL).maybeSingle();
  const userId = user?.id ?? prof.data?.id ?? null;
  if (!userId) { if (!quiet) console.log(`teardown: nothing to remove (no ${E2E_EMAIL}).`); return { deleted: {} }; }

  // guard against ever deleting the wrong account
  assertSafeTarget(userId, (user?.email ?? prof.data?.email ?? E2E_EMAIL));

  if (!quiet) console.log(`teardown target: ${userId}  (${E2E_EMAIL})`);
  const deleted = {};
  for (const [tbl, col] of [["strategy_sections", "user_id"], ["strategies", "user_id"], ["onboarding_responses", "user_id"], ["profiles", "id"]]) {
    const { data, error } = await admin.from(tbl).delete().eq(col, userId).select("id");
    if (error) throw new Error(`delete ${tbl} failed: ${error.message}`);
    deleted[tbl] = data.length;
    if (!quiet) console.log(`  ${tbl}: ${data.length} deleted`);
  }
  if (user) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && !/not found/i.test(error.message)) throw new Error(`deleteUser failed: ${error.message}`);
    deleted.auth_user = 1;
    if (!quiet) console.log(`  auth.users: 1 deleted`);
  }
  return { deleted, userId };
}

// ── get-or-create the disposable auth user + active client profile ──
async function ensureAccount() {
  let user = await findAuthUser(E2E_EMAIL);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: E2E_EMAIL, password: randomBytes(32).toString("base64url"),
      email_confirm: true, user_metadata: { name: E2E_NAME },
    });
    if (error) throw new Error(`createUser failed: ${error.message}`);
    user = data.user;
  }
  assertSafeTarget(user.id, user.email);
  // upsert an active client profile (no invite email)
  const { error: insErr } = await admin.from("profiles").insert({
    id: user.id, email: E2E_EMAIL, name: E2E_NAME, role: "client",
    account_status: "active", onboarding_complete: true,
  });
  if (insErr) {
    const { error: updErr } = await admin.from("profiles")
      .update({ email: E2E_EMAIL, name: E2E_NAME, account_status: "active", onboarding_complete: true })
      .eq("id", user.id);
    if (updErr) throw new Error(`profile upsert failed: ${updErr.message}`);
  }
  return user.id;
}

// Representative onboarding answers (a subset of columns — enough for a
// meaningful --live prompt; the rest default to null).
const ONBOARDING = {
  describe_yourself_3_words: "Direct, practical, warm",
  what_makes_you_different: "Systems-first coaching backed by real data, not vibes.",
  one_sentence_description: "I help busy strength coaches turn content into booked calls.",
  ideal_client: "Online strength coach, 25-40, 1-2k followers, stuck under 5k/mo.",
  client_struggles: "Inconsistent posting, no clear offer, leads that never convert.",
  top_three_goals: "Hit 10k/mo, build an email list, post 5x/week without burning out.",
  platforms: "Instagram (primary), YouTube (growth)",
  posting_frequency: "3-4x per week, wants to reach daily",
  products_services: "1:1 coaching (£300/mo), 12-week transformation (£1200)",
  biggest_challenge: "Turning followers into paying clients.",
  timezone: "Europe/London",
  anything_else: "[E2E FIXTURE] Disposable test record — safe to delete.",
};

function fixtureSections() {
  const titles = [
    "Positioning & Market Angle", "Ideal Client Profile", "Core Message & Promise",
    "Content Pillars", "Brand Voice & Tone", "Offer Ladder",
    "90-Day Content Plan", "Hook Bank", "Posting Cadence",
    "Lead Funnel & Nurture", "90-Day Growth Roadmap", "Metrics & Review Cadence",
  ];
  return titles.map((title, i) => ({
    section_number: i + 1,
    section_title: title,
    content: `**[E2E FIXTURE — not real strategy output]**\n\nPlaceholder content for "${title}". This section exists so the review/release UI has data to render. Generated by \`scripts/e2e-strategy.mjs --run\`.`,
  }));
}

async function seedCommon(status) {
  const userId = await ensureAccount();
  const { data: onb, error: onbErr } = await admin.from("onboarding_responses")
    .insert({ user_id: userId, status: "submitted", ...ONBOARDING })
    .select("id").single();
  if (onbErr || !onb) throw new Error(`onboarding insert failed: ${onbErr?.message}`);
  const reviewDeadline = new Date(Date.now() + REVIEW_WINDOW_DAYS * 86_400_000).toISOString();
  const { data: strat, error: stratErr } = await admin.from("strategies")
    .insert({ user_id: userId, onboarding_id: onb.id, client_name: E2E_NAME.split(" ")[0], status, review_deadline: reviewDeadline })
    .select("id").single();
  if (stratErr || !strat) throw new Error(`strategy insert failed: ${stratErr?.message}`);
  return { userId, onboardingId: onb.id, strategyId: strat.id };
}

// ── mode: fixture run (default) — no API cost ──
async function runFixture() {
  console.log("MODE: --run (fixture, no API cost)\n");
  await teardown({ quiet: true }); // clean slate
  let ctx;
  try {
    ctx = await seedCommon("complete");
    const sections = fixtureSections().map((s) => ({ ...s, strategy_id: ctx.strategyId, user_id: ctx.userId, status: "complete" }));
    const { error } = await admin.from("strategy_sections").insert(sections);
    if (error) throw new Error(`sections insert failed: ${error.message}`);
    // stamp completed_at so the review UI treats it as a finished, in-review strategy
    await admin.from("strategies").update({ completed_at: new Date().toISOString() }).eq("id", ctx.strategyId);
  } catch (err) {
    console.error("seed failed — auto-tearing-down to avoid orphans:", err.message);
    await teardown({ quiet: true });
    throw err;
  }
  console.log("Seeded fixture strategy (status=complete, in-review):");
  console.log(await countOwned(ctx.userId));
  console.log(`\n  user id     : ${ctx.userId}`);
  console.log(`  strategy id : ${ctx.strategyId}`);
  console.log(`  view as     : /strategy?as=${ctx.userId}   (sign in as an admin)`);
  console.log(`\nClean up when done:  node scripts/e2e-strategy.mjs --teardown`);
}

// ── mode: live — real generate-strategy task (costs Anthropic tokens) ──
async function runLive() {
  console.log("MODE: --live (REAL generate-strategy — Anthropic tokens will be spent)\n");
  console.log("Requires a running worker:  npx trigger dev   (runs expire otherwise)\n");
  await teardown({ quiet: true });
  let ctx;
  try {
    ctx = await seedCommon("pending");
  } catch (err) {
    console.error("seed failed — auto-tearing-down to avoid orphans:", err.message);
    await teardown({ quiet: true });
    throw err;
  }
  const { tasks } = await import("@trigger.dev/sdk");
  await tasks.trigger("generate-strategy", { strategyId: ctx.strategyId, userId: ctx.userId, onboardingId: ctx.onboardingId });
  console.log(`Triggered generate-strategy for strategy ${ctx.strategyId}. Polling…`);

  const TIMEOUT_MS = 6 * 60_000, STEP_MS = 5_000;
  const started = Date.now();
  let status = "pending";
  while (Date.now() - started < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, STEP_MS));
    const { data } = await admin.from("strategies").select("status").eq("id", ctx.strategyId).maybeSingle();
    status = data?.status ?? status;
    process.stdout.write(`  status=${status}  (+${Math.round((Date.now() - started) / 1000)}s)\n`);
    if (status === "complete" || status === "failed") break;
  }
  const counts = await countOwned(ctx.userId);
  console.log("\nResult:", counts);
  if (status === "complete") {
    console.log(`✓ Live path proven — ${counts.strategy_sections} real sections written.`);
    console.log(`  view as: /strategy?as=${ctx.userId}    then: node scripts/e2e-strategy.mjs --teardown`);
  } else {
    console.log(`✗ Ended status=${status}. Check the Trigger.dev dashboard / worker logs.`);
    console.log(`  Rows left for inspection. Clean up: node scripts/e2e-strategy.mjs --teardown`);
    process.exitCode = 1;
  }
}

// ── mode: teardown — before/after transparency ──
async function runTeardown() {
  console.log("MODE: --teardown\n");
  const user = await findAuthUser(E2E_EMAIL);
  if (user) console.log("BEFORE:", await countOwned(user.id));
  await teardown();
  const after = await findAuthUser(E2E_EMAIL);
  console.log("AFTER: auth user", after ? "STILL EXISTS (!!)" : "gone ✓");
}

// ── dispatch ──
const args = new Set(process.argv.slice(2));
try {
  if (args.has("--teardown")) await runTeardown();
  else if (args.has("--live")) await runLive();
  else await runFixture();
} catch (err) {
  console.error("\nFATAL:", err.message);
  process.exit(1);
}
