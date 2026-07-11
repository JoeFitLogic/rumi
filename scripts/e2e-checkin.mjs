// ─────────────────────────────────────────────────────────────────────────
// E2E Weekly Check-In harness — sanctioned, per docs/production-db-guidelines.md
//
//   node scripts/e2e-checkin.mjs            # --live (default): real upsert path
//   node scripts/e2e-checkin.mjs --teardown # remove all E2E rows (idempotent)
//
// WHAT IT PROVES
//   The submit path's DB contract against a disposable @rumi.test client:
//   • upsert on (user_id, week_starting) — resubmitting a week UPDATES the one
//     row instead of duplicating it (needs the unique index from sql/0010),
//   • calls_attended_note is saved (the "why" text, added in sql/0010),
//   • stuck_areas text[] round-trips.
//   Value coercion (toPayload) is unit-tested separately against the real module.
//
// PREREQUISITE: sql/0010 must be applied. The harness preflights and tells you
// if it isn't (DDL can't be run from Node — only the Supabase SQL editor).
//
// SAFETY (mirrors scripts/e2e-strategy.mjs)
//   • Fixed disposable identity e2e-checkin@rumi.test — the stable key.
//   • Guarded: email MUST equal the identity AND end @rumi.test AND id MUST NOT
//     be in PROTECTED (which includes the Priya/Marcus seed clients).
//   • Teardown is idempotent, runs first for a clean slate and again on any seed
//     failure. No invite email is sent.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync } from "fs";
import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) { env[m[1]] = m[2].trim(); process.env[m[1]] = m[2].trim(); }
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const E2E_EMAIL = "e2e-checkin@rumi.test";
const E2E_NAME = "E2E Check In";

const PROTECTED_IDS = new Set([
  "e19354ba-0988-4721-8fe2-d4ae983d8b9f", // joe@fitlogicsystems.co.uk
  "c151a827-dd34-45d4-a887-89e291eaaa6a", // info@contentcoachhq.com
  "11111111-1111-4111-8111-111111111111", // seed-one / Priya  — NEVER write
  "22222222-2222-4222-8222-222222222222", // seed-two / Marcus — NEVER write
]);

function assertSafeTarget(userId, email) {
  const e = (email || "").toLowerCase();
  if (e !== E2E_EMAIL) throw new Error(`refusing to act on ${email} — not the E2E identity`);
  if (!e.endsWith("@rumi.test")) throw new Error(`refusing to act on ${email} — not @rumi.test`);
  if (PROTECTED_IDS.has(userId)) throw new Error(`refusing to act on protected id ${userId}`);
}

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

async function teardown({ quiet = false } = {}) {
  const user = await findAuthUser(E2E_EMAIL);
  const prof = await admin.from("profiles").select("id,email").eq("email", E2E_EMAIL).maybeSingle();
  const userId = user?.id ?? prof.data?.id ?? null;
  if (!userId) { if (!quiet) console.log(`teardown: nothing to remove (no ${E2E_EMAIL}).`); return; }
  assertSafeTarget(userId, user?.email ?? prof.data?.email ?? E2E_EMAIL);
  if (!quiet) console.log(`teardown target: ${userId}  (${E2E_EMAIL})`);
  for (const [tbl, col] of [["checkin_analysis", "user_id"], ["checkin_responses", "user_id"], ["profiles", "id"]]) {
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
  const { error: insErr } = await admin.from("profiles").insert({
    id: user.id, email: E2E_EMAIL, name: E2E_NAME, role: "client",
    account_status: "active", onboarding_complete: true,
  });
  if (insErr) {
    await admin.from("profiles")
      .update({ email: E2E_EMAIL, name: E2E_NAME, account_status: "active", onboarding_complete: true })
      .eq("id", user.id);
  }
  return user.id;
}

// Preflight: sql/0010 applied? (calls_attended_note column present)
async function preflight() {
  const { error } = await admin.from("checkin_responses").select("calls_attended_note").limit(1);
  if (error && /calls_attended_note/.test(error.message)) return false;
  if (error) throw new Error(`preflight failed: ${error.message}`);
  return true;
}

function mondayThisWeek() {
  const n = new Date();
  const d = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function upsertWeek(userId, week, patch) {
  const { data, error } = await admin
    .from("checkin_responses")
    .upsert({ user_id: userId, week_starting: week, ...patch }, { onConflict: "user_id,week_starting" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function runLive() {
  console.log("MODE: --live (real check-in upsert against a disposable @rumi.test client)\n");

  if (!(await preflight())) {
    console.log("✗ sql/0010 is NOT applied yet (calls_attended_note missing).");
    console.log("  Run sql/0010_checkin_upsert_and_note.sql in the Supabase SQL editor, then re-run this.");
    process.exit(2);
  }

  await teardown({ quiet: true });
  let userId;
  try {
    userId = await ensureAccount();
  } catch (err) {
    console.error("seed failed — auto-tearing-down:", err.message);
    await teardown({ quiet: true });
    throw err;
  }

  const week = mondayThisWeek();
  try {
    // 1. First submission (INSERT via upsert).
    const first = await upsertWeek(userId, week, {
      calls_attended: 2, calls_attended_note: "one was a no-show",
      calls_booked: 9, cash_collected: 3200, followers_gained: 210,
      content_volume: 6, dm_confidence: 7, content_satisfaction: 6,
      mindset_score: 5, biggest_win: "First VSL booked calls",
      stuck_areas: ["DM conversations", "Discovery calls"],
    });

    // 2. Resubmit SAME week (must UPDATE the same row, not duplicate).
    const second = await upsertWeek(userId, week, {
      calls_attended: 4, calls_attended_note: "rebooked the no-show",
      calls_booked: 12, mindset_score: 8,
      stuck_areas: ["Confidence on camera"],
    });

    // 3. Read back the whole library.
    const { data: all } = await admin.from("checkin_responses").select("*").eq("user_id", userId);

    console.log("─── RESULTS ───");
    console.log("rows after two submits :", all.length, "(expect 1 — upsert, not duplicate)");
    console.log("same row id            :", first.id === second.id ? "yes ✓" : "NO (duplicated!)");
    console.log("calls_booked updated   :", second.calls_booked, "(expect 12)");
    console.log("mindset updated        :", second.mindset_score, "(expect 8)");
    console.log("calls_attended_note    :", JSON.stringify(second.calls_attended_note), "(expect 'rebooked the no-show')");
    console.log("stuck_areas array      :", JSON.stringify(second.stuck_areas), "(expect ['Confidence on camera'])");

    const ok =
      all.length === 1 && first.id === second.id && second.calls_booked === 12 &&
      second.mindset_score === 8 && second.calls_attended_note === "rebooked the no-show" &&
      Array.isArray(second.stuck_areas) && second.stuck_areas.length === 1 &&
      second.stuck_areas[0] === "Confidence on camera";

    console.log("\nTearing down…");
    await teardown();
    const gone = await findAuthUser(E2E_EMAIL);
    console.log("auth user after teardown:", gone ? "STILL EXISTS (!!)" : "gone ✓");

    console.log(ok && !gone ? "\n✓ PASS — upsert-per-week, note + array all verified, no rows left." : "\n✗ FAIL — see mismatches above.");
    if (!ok || gone) process.exitCode = 1;
  } catch (err) {
    if (/ON CONFLICT|unique|exclusion/i.test(err.message || "")) {
      console.log("✗ Upsert conflict target missing — sql/0010's unique index isn't applied yet.");
      console.log("  Run sql/0010_checkin_upsert_and_note.sql, then re-run.");
    } else {
      console.error("FATAL:", err.message);
    }
    await teardown({ quiet: true }).catch(() => {});
    process.exit(1);
  }
}

const args = new Set(process.argv.slice(2));
try {
  if (args.has("--teardown")) { console.log("MODE: --teardown\n"); await teardown(); }
  else await runLive();
} catch (err) {
  console.error("\nFATAL:", err.message);
  await teardown({ quiet: true }).catch(() => {});
  process.exit(1);
}
