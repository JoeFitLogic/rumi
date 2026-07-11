// ─────────────────────────────────────────────────────────────────────────
// E2E Check-In Analysis harness — sanctioned, per docs/production-db-guidelines.md
//
//   node scripts/e2e-checkin-analysis.mjs            # --live (default): real analysis $$
//   node scripts/e2e-checkin-analysis.mjs --teardown # remove all E2E rows (idempotent)
//
// WHAT IT PROVES
//   The Saturday-cron / manual-button analysis path against a disposable
//   @rumi.test client seeded with 6 weeks of check-ins:
//   • Claude (real, with the VERBATIM prompt read from
//     src/lib/prompts/checkin-analysis.ts) turns real numbers + words into
//     red_flags / plateaus / themes / recommendations that reference the data,
//   • the result upserts to checkin_analysis on (user_id, week_starting)
//     (needs the unique index from sql/0011),
//   • the written row satisfies the EXACT queries the dashboard Recommendations
//     card and the check-in Results analysis panel use — i.e. their empty states
//     now render content.
//   (buildAnalysisInput / parseAnalysis are additionally unit-tested against the
//   real module; the digest + parse below mirror src/lib/checkin-analysis-core.ts.)
//
// PREREQUISITE: sql/0011 applied. The harness detects a missing conflict target
// and tells you. DDL can't run from Node — only the Supabase SQL editor.
//
// SAFETY: fixed identity e2e-analysis@rumi.test; guarded so it can never touch a
// non-@rumi.test or protected id (incl. the Priya/Marcus seeds); idempotent
// teardown runs first and on any seed failure. No emails sent.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync } from "fs";
import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) { env[m[1]] = m[2].trim(); process.env[m[1]] = m[2].trim(); }
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const MODEL = env.CHECKIN_ANALYSIS_MODEL ?? "claude-sonnet-4-6";

const E2E_EMAIL = "e2e-analysis@rumi.test";
const E2E_NAME = "E2E Analysis";

const PROTECTED_IDS = new Set([
  "e19354ba-0988-4721-8fe2-d4ae983d8b9f", // joe@fitlogicsystems.co.uk
  "c151a827-dd34-45d4-a887-89e291eaaa6a", // info@contentcoachhq.com
  "11111111-1111-4111-8111-111111111111", // Priya — NEVER write
  "22222222-2222-4222-8222-222222222222", // Marcus — NEVER write
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

function mondayMinus(weeksAgo) {
  const n = new Date();
  const d = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - weeksAgo * 7);
  return d.toISOString().slice(0, 10);
}

// 6 weeks, a clear decline + telling words, current week last. Distinctive
// numbers/phrases so we can assert the model actually used the data.
const WEEKS = [
  { wago: 5, calls_booked: 12, cash_collected: 3200, followers_gained: 260, content_volume: 9, mindset_score: 8, biggest_win: "Closed two high-ticket clients from Reels", growth_blocker: "Honestly nothing, riding a wave", week_priority: "Double down on story selling", stuck_areas: [] },
  { wago: 4, calls_booked: 10, cash_collected: 2600, followers_gained: 240, content_volume: 8, mindset_score: 7, biggest_win: "First VSL booked five calls", growth_blocker: "Starting to feel stretched thin", week_priority: "Tighten the offer", stuck_areas: ["Time and capacity"] },
  { wago: 3, calls_booked: 9, cash_collected: 2100, followers_gained: 210, content_volume: 6, mindset_score: 6, biggest_win: "Landed a podcast slot", growth_blocker: "I keep second-guessing my content", week_priority: "Post consistently", stuck_areas: ["Confidence on camera", "Knowing what to post"] },
  { wago: 2, calls_booked: 7, cash_collected: 1500, followers_gained: 180, content_volume: 5, mindset_score: 5, biggest_win: "Cleared the DM backlog", growth_blocker: "Leads are going cold before the call", week_priority: "Follow up faster", stuck_areas: ["Converting followers into leads", "DM conversations"] },
  { wago: 1, calls_booked: 6, cash_collected: 1200, followers_gained: 150, content_volume: 4, mindset_score: 5, biggest_win: "Managed to post four times", growth_blocker: "I feel like I'm shouting into the void", week_priority: "Get one good call booked", stuck_areas: ["Converting followers into leads"] },
  { wago: 0, calls_booked: 5, cash_collected: 900, followers_gained: 120, content_volume: 3, mindset_score: 4, biggest_win: "Not much this week, just survived", growth_blocker: "I'm exhausted and starting to doubt the whole thing", week_priority: "Reset and get my head straight", stuck_areas: ["Confidence on camera", "Converting followers into leads"] },
];

// Read the VERBATIM system prompt from the source file (no drift).
function loadPrompt() {
  const src = readFileSync(new URL("../src/lib/prompts/checkin-analysis.ts", import.meta.url), "utf8");
  const m = src.match(/CHECKIN_ANALYSIS_SYSTEM\s*=\s*`([\s\S]*?)`;/);
  if (!m) throw new Error("could not extract CHECKIN_ANALYSIS_SYSTEM from prompt file");
  return m[1];
}

// Mirrors src/lib/checkin-analysis-core.ts buildAnalysisInput (kept aligned).
function buildInput(name, weeksAsc) {
  const NUM = [
    ["calls_booked", "calls booked"], ["cash_collected", "cash collected"],
    ["followers_gained", "followers gained"], ["content_volume", "content posted"],
    ["mindset_score", "mindset"],
  ];
  const p = [`CLIENT: ${name}`, `WEEKS OF DATA: ${weeksAsc.length} (oldest first). Current week is the last one.`, "", "WEEKLY NUMBERS"];
  for (const w of weeksAsc) {
    const bits = NUM.filter(([c]) => w[c] != null).map(([c, l]) =>
      c === "cash_collected" ? `${l} £${w[c].toLocaleString("en-GB")}` : c === "mindset_score" ? `${l} ${w[c]}/10` : `${l} ${w[c]}`);
    p.push(`- Week of ${w.week_starting}: ${bits.join(", ")}`);
  }
  p.push("", "THEIR WORDS, WEEK BY WEEK");
  for (const w of weeksAsc) {
    p.push(`Week of ${w.week_starting}:`);
    if (w.biggest_win) p.push(`  - Biggest win\n    "${w.biggest_win}"`);
    if (w.growth_blocker) p.push(`  - What is stopping growth\n    "${w.growth_blocker}"`);
    if (w.week_priority) p.push(`  - Priority for the week\n    "${w.week_priority}"`);
    if (w.stuck_areas?.length) p.push(`  - Where they feel most stuck: ${w.stuck_areas.join(", ")}`);
    p.push("");
  }
  return p.join("\n").trim();
}

function parseAnalysis(raw) {
  let s = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a !== -1 && b > a) s = s.slice(a, b + 1);
  const o = JSON.parse(s);
  const str = (v) => (v == null ? "" : Array.isArray(v) ? v.map(String).join("\n") : String(v).trim());
  return { red_flags: str(o.red_flags), plateaus: str(o.plateaus), themes: str(o.themes), recommendations: str(o.recommendations) };
}

async function runLive() {
  console.log("MODE: --live (real analysis against a disposable @rumi.test client)\n");
  await teardown({ quiet: true });

  let userId;
  try {
    userId = await ensureAccount();
    const rows = WEEKS.map((w) => {
      const { wago, ...rest } = w;
      return { user_id: userId, week_starting: mondayMinus(wago), ...rest };
    });
    const { error } = await admin.from("checkin_responses").insert(rows);
    if (error) throw new Error(`seed insert failed: ${error.message}`);
  } catch (err) {
    console.error("seed failed — auto-tearing-down:", err.message);
    await teardown({ quiet: true });
    throw err;
  }

  const week = mondayMinus(0);
  const weeksAsc = WEEKS.map((w) => ({ ...w, week_starting: mondayMinus(w.wago) }));

  console.log(`Calling ${MODEL} with the verbatim prompt…`);
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let parsed;
  try {
    const msg = await anthropic.messages.create({
      model: MODEL, max_tokens: 1600, system: loadPrompt(),
      messages: [{ role: "user", content: buildInput(E2E_NAME, weeksAsc) }],
    });
    parsed = parseAnalysis(msg.content.filter((b) => b.type === "text").map((b) => b.text).join(""));

    const { error: upErr } = await admin.from("checkin_analysis").upsert({
      user_id: userId, week_starting: week,
      red_flags: parsed.red_flags || null, plateaus: parsed.plateaus || null,
      themes: parsed.themes || null, recommendations: parsed.recommendations || null,
      created_at: new Date().toISOString(),
    }, { onConflict: "user_id,week_starting" });
    if (upErr) {
      if (/ON CONFLICT|unique|exclusion/i.test(upErr.message)) {
        console.log("\n✗ sql/0011 not applied — no unique index on (user_id, week_starting).");
        console.log("  Run sql/0011_checkin_analysis_unique.sql, then re-run.");
        await teardown({ quiet: true });
        process.exit(2);
      }
      throw new Error(`upsert failed: ${upErr.message}`);
    }
  } catch (err) {
    console.error("FATAL:", err.message);
    await teardown({ quiet: true }).catch(() => {});
    process.exit(1);
  }

  // Render-query checks: EXACT selects the dashboard + check-in results use.
  const { data: dash } = await admin.from("checkin_analysis")
    .select("week_starting, created_at, recommendations, red_flags, themes")
    .eq("user_id", userId).order("week_starting", { ascending: false })
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: panel } = await admin.from("checkin_analysis")
    .select("*").eq("user_id", userId).order("week_starting", { ascending: false }).limit(1).maybeSingle();

  const blob = `${parsed.red_flags}\n${parsed.plateaus}\n${parsed.themes}\n${parsed.recommendations}`;
  const refsNumber = /\b(12|10|9|8|7|6|5|4|3200|2600|900|1200)\b/.test(blob); // seed numbers
  const refsTrend = /(down|fall|fell|dropp?|declin|slid|three|3 weeks|four weeks|week after week)/i.test(blob);

  console.log("\n─── RESULTS ───");
  console.log("recommendations written :", parsed.recommendations ? "yes ✓" : "NO");
  console.log("dashboard query row     :", dash && (dash.recommendations || dash.red_flags || dash.themes) ? "populated ✓" : "empty/NULL");
  console.log("results-panel query row :", panel ? "present ✓" : "missing");
  console.log("references seed numbers  :", refsNumber ? "yes ✓" : "not detected");
  console.log("names the decline/trend  :", refsTrend ? "yes ✓" : "not detected");
  console.log("red_flags present        :", parsed.red_flags ? "yes ✓" : "(none — model chose not to flag)");

  console.log("\n─── ANALYSIS PREVIEW ───");
  for (const k of ["red_flags", "plateaus", "themes", "recommendations"]) {
    if (parsed[k]) console.log(`\n[${k}]\n${parsed[k]}`);
  }

  console.log("\nTearing down…");
  await teardown();
  const gone = await findAuthUser(E2E_EMAIL);
  console.log("auth user after teardown:", gone ? "STILL EXISTS (!!)" : "gone ✓");

  const ok = !!parsed.recommendations && !!dash && !!(dash.recommendations || dash.red_flags || dash.themes) && !!panel && refsNumber && !gone;
  console.log(ok ? "\n✓ PASS — analysis references the data, upserts, and renders. No rows left." : "\n✗ FAIL — see above.");
  if (!ok) process.exitCode = 1;
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
