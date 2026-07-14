// ─────────────────────────────────────────────────────────────────────────
// LIVE pipeline round-trip — sanctioned, ONE real scrape (real Apify + AI $).
//
//   node --experimental-strip-types --import ./scripts/_alias-register.mjs \
//        scripts/e2e-pipeline-live.ts
//   ...  scripts/e2e-pipeline-live.ts --teardown   # remove leftovers only
//
// Drives the REAL startPipeline (smai.ts) + claimPipelineVideos (competitor.ts):
//   1. disposable e2e-live@rumi.test client + a UNIQUE-named config (no creators
//      added — SMAI scrapes ALL creators regardless of config; unique name keeps
//      the claim unambiguous).
//   2. POST /api/pipeline (Trigger.dev) → SMAI scrapes via Apify → analyses →
//      inserts video rows (NULL client_id, our configName, today).
//   3. claimPipelineVideos(client, today, ourConfig) → tags exactly those rows.
//   4. verify: only our-config NULL-today rows got our client_id; legacy
//      "Fitness Coaches" rows + counts untouched; claimed count == actual.
//
// Cost control: maxVideos small, topK=1. Snapshots Apify monthly-usage $ before/
// after (captures real Apify cost IFF SMAI shares this token). Gemini/Claude run
// on SMAI's accounts — units reported, $ not directly queryable here.
//
// SAFETY: teardown removes ONLY our unique-config videos + our config + user.
// The 4 legacy creators and the "Fitness Coaches" videos are never touched.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync } from "fs";
import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { startPipeline } from "../src/lib/research/smai.ts";
import { createConfig, claimPipelineVideos } from "../src/lib/research/competitor.ts";

const env: Record<string, string> = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) { env[m[1]] = m[2].trim(); process.env[m[1]] = m[2].trim(); }
}
const seed = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const E2E_EMAIL = "e2e-live@rumi.test";
const E2E_NAME = "E2E Live Pipeline";
// Deterministic-per-run unique config name so the claim can never be ambiguous.
const RUN_TAG = randomBytes(4).toString("hex");
const CFG_NAME = `e2e-live-${RUN_TAG}`;
const TODAY = new Date().toISOString().slice(0, 10);
const PROTECTED = new Set([
  "e19354ba-0988-4721-8fe2-d4ae983d8b9f", "c151a827-dd34-45d4-a887-89e291eaaa6a",
  "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222",
]);

function assertSafe(userId: string, email: string) {
  const e = (email || "").toLowerCase();
  if (e !== E2E_EMAIL || !e.endsWith("@rumi.test") || PROTECTED.has(userId)) {
    throw new Error(`refusing to act on ${email} / ${userId}`);
  }
}
async function findAuthUser(email: string) {
  const t = email.toLowerCase();
  for (let p = 1; p <= 50; p++) {
    const { data, error } = await seed.auth.admin.listUsers({ page: p, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => (u.email || "").toLowerCase() === t);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}
async function teardown({ quiet = false } = {}) {
  // Videos: only our unique-config rows (claimed OR orphan NULL). Never "Fitness Coaches".
  const dv = await seed.from("videos").delete().eq("configName", CFG_NAME).select("id");
  const user = await findAuthUser(E2E_EMAIL);
  const prof = await seed.from("profiles").select("id,email").eq("email", E2E_EMAIL).maybeSingle();
  const userId = user?.id ?? prof.data?.id ?? null;
  if (userId) {
    assertSafe(userId, user?.email ?? prof.data?.email ?? E2E_EMAIL);
    await seed.from("videos").delete().eq("client_id", userId);
    await seed.from("configs").delete().eq("client_id", userId);
    await seed.from("profiles").delete().eq("id", userId);
    if (user) {
      const { error } = await seed.auth.admin.deleteUser(userId);
      if (error && !/not found/i.test(error.message)) throw new Error(error.message);
    }
  }
  if (!quiet) console.log(`teardown: removed ${dv.data?.length ?? 0} '${CFG_NAME}' videos + config/profile/user`);
}
async function ensureAccount(): Promise<string> {
  let user = await findAuthUser(E2E_EMAIL);
  if (!user) {
    const { data, error } = await seed.auth.admin.createUser({
      email: E2E_EMAIL, password: randomBytes(32).toString("base64url"),
      email_confirm: true, user_metadata: { name: E2E_NAME },
    });
    if (error) throw new Error(error.message);
    user = data.user;
  }
  assertSafe(user.id, user.email ?? "");
  const { error } = await seed.from("profiles").insert({
    id: user.id, email: E2E_EMAIL, name: E2E_NAME, role: "client",
    account_status: "active", onboarding_complete: true,
  });
  if (error) await seed.from("profiles").update({ name: E2E_NAME }).eq("id", user.id);
  return user.id;
}

async function apifyUsageUsd(): Promise<number | null> {
  try {
    const r = await fetch(`https://api.apify.com/v2/users/me/usage/monthly?token=${env.APIFY_API_TOKEN}`);
    const j = await r.json();
    const d = j.data ?? {};
    const v = d.totalUsageCreditsUsdBeforeVolumeDiscount ?? d.totalUsageCreditsUsd ?? d.monthlyUsageUsd ?? null;
    return typeof v === "number" ? v : null;
  } catch { return null; }
}
async function runStatus(runId: string, token: string): Promise<{ status?: string; progress?: any } | null> {
  try {
    const r = await fetch(`https://api.trigger.dev/api/v3/runs/${runId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const j = await r.json();
    return { status: j.status ?? j.data?.status, progress: j.metadata?.progress ?? j.data?.metadata?.progress };
  } catch { return null; }
}
async function myConfigVideos() {
  const { data } = await seed.from("videos")
    .select("id, client_id, dateAdded, configName, creator")
    .eq("configName", CFG_NAME);
  return data ?? [];
}
async function legacyNullFitnessCount(): Promise<number> {
  const { count } = await seed.from("videos")
    .select("id", { count: "exact", head: true })
    .is("client_id", null).eq("configName", "Fitness Coaches");
  return count ?? 0;
}

async function run() {
  console.log(`MODE: LIVE — one real scrape. config='${CFG_NAME}' day=${TODAY}\n`);
  await teardown({ quiet: true });

  const clientId = await ensureAccount();
  await createConfig(clientId, {
    configName: CFG_NAME, creatorsCategory: "any",
    analysisInstruction: "Briefly break down the hook, structure and why it works.",
    newConceptsInstruction: "Suggest 2 adapted concepts for a nutrition coach.",
  });
  console.log(`client ${clientId} + config '${CFG_NAME}' created\n`);

  const baseLegacy = await legacyNullFitnessCount();
  const apifyBefore = await apifyUsageUsd();
  console.log(`baseline: legacy 'Fitness Coaches' NULL videos = ${baseLegacy}; Apify usage $ = ${apifyBefore ?? "n/a"}`);

  // ── trigger (real spend from here) ──
  console.log("\nTriggering pipeline (maxVideos=5, topK=1, nDays=30)…");
  const { runId, publicToken } = await startPipeline({ configName: CFG_NAME, maxVideos: 5, topK: 1, nDays: 30 });
  console.log(`run ${runId} started; polling up to ~13m…`);

  // ── poll run status + videos ──
  const deadline = Date.now() + 13 * 60 * 1000;
  let lastStatus = "", lastProgress: any = null, terminal = false;
  while (Date.now() < deadline) {
    await sleep(15000);
    const st = await runStatus(runId, publicToken);
    const vids = await myConfigVideos();
    if (st) { lastStatus = st.status ?? lastStatus; if (st.progress) lastProgress = st.progress; }
    const p = lastProgress;
    console.log(`  [${new Date().toISOString().slice(11,19)}] status=${lastStatus||"?"} scraped=${p?.creatorsScraped ?? "?"}/${p?.creatorsTotal ?? "?"} analyzed=${p?.videosAnalyzed ?? "?"} errors=${p?.errors?.length ?? "?"} | videos(mine)=${vids.length}`);
    const done = ["COMPLETED","FAILED","CANCELED","CRASHED","TIMED_OUT"].includes(lastStatus);
    if (done) { terminal = true; break; }
    if (vids.length > 0 && lastStatus === "") { /* no status api but rows landed */ break; }
  }
  console.log(`\nrun ${terminal ? "reached terminal state" : "poll ended"}: status=${lastStatus||"(no status api)"}`);
  if (lastProgress?.errors?.length) console.log("run errors:", JSON.stringify(lastProgress.errors));
  if (lastProgress?.log?.length) console.log("run log tail:", JSON.stringify(lastProgress.log.slice(-6)));

  // ── pre-claim snapshot ──
  const pre = await myConfigVideos();
  const preNull = pre.filter((v) => v.client_id === null);
  console.log(`\npre-claim: ${pre.length} '${CFG_NAME}' videos (${preNull.length} NULL, ${pre.length - preNull.length} already tagged)`);
  pre.forEach((v) => console.log(`   ${v.id.slice(0,12)}… @${v.creator} date=${v.dateAdded} client_id=${v.client_id ?? "NULL"}`));

  // ── CLAIM (the thing under test) ──
  const { claimed } = { claimed: await claimPipelineVideos(clientId, TODAY, CFG_NAME) };
  console.log(`\nclaimPipelineVideos(...) => claimed = ${claimed}`);

  // ── verify ──
  const post = await myConfigVideos();
  const nowMine = post.filter((v) => v.client_id === clientId);
  const stillNull = post.filter((v) => v.client_id === null);
  const legacyAfter = await legacyNullFitnessCount();

  const results: Record<string, boolean> = {};
  results.claimedMatchesActual = claimed === preNull.length;               // returned count == rows that were NULL
  results.allMineTagged = nowMine.length === post.length && post.length > 0; // every my-config row is now mine
  results.dayGrainAllToday = post.every((v) => v.dateAdded >= TODAY);       // all carried today's date
  results.noStragglerNull = stillNull.length === 0;                        // nothing matching left unclaimed
  results.legacyUntouched = legacyAfter === baseLegacy;                    // Fitness Coaches count unchanged

  const apifyAfter = await apifyUsageUsd();
  const apifyDelta = apifyBefore != null && apifyAfter != null ? +(apifyAfter - apifyBefore).toFixed(4) : null;

  console.log("\n─── VERIFY (direct Supabase queries) ───");
  console.log(`claimed==actual NULL rows : ${claimed}==${preNull.length}  ${results.claimedMatchesActual?"✓":"✗"}`);
  console.log(`all '${CFG_NAME}' rows now mine: ${nowMine.length}/${post.length}  ${results.allMineTagged?"✓":"✗"}`);
  console.log(`all carry today's date     : ${results.dayGrainAllToday?"✓":"✗"}`);
  console.log(`no unclaimed straggler NULL : ${stillNull.length}  ${results.noStragglerNull?"✓":"✗"}`);
  console.log(`legacy 'Fitness Coaches'    : ${baseLegacy}→${legacyAfter}  ${results.legacyUntouched?"✓":"✗"}`);

  console.log("\n─── COST ───");
  console.log(`creators scraped (units)   : ${lastProgress?.creatorsScraped ?? "?"} of ${lastProgress?.creatorsTotal ?? 4}`);
  console.log(`videos analyzed (Gemini+Claude units): ${lastProgress?.videosAnalyzed ?? post.length}`);
  console.log(`Apify $ (this token) before→after: ${apifyBefore ?? "n/a"} → ${apifyAfter ?? "n/a"}  Δ=${apifyDelta ?? "n/a (SMAI may use a different Apify token)"}`);

  console.log("\nTearing down…");
  await teardown();
  const gone = await findAuthUser(E2E_EMAIL);
  const finalLegacy = await legacyNullFitnessCount();

  const ok = post.length > 0 && Object.values(results).every(Boolean) && !gone && finalLegacy === baseLegacy;
  console.log("\n─── VERDICT ───");
  for (const [k, v] of Object.entries(results)) console.log(`${k.padEnd(22)}: ${v ? "PASS" : "FAIL"}`);
  console.log(`videos produced          : ${post.length}${post.length === 0 ? "  (⚠ scrape yielded nothing — see run errors/status above)" : ""}`);
  console.log(`cleanup                  : ${gone ? "STILL EXISTS(!!)" : "clean"} · legacy ${finalLegacy===baseLegacy?"intact":"CHANGED(!!)"}`);
  console.log(ok ? "\n✓ LIVE ROUND-TRIP VERIFIED — claim correctly scoped, legacy intact." :
    post.length === 0 ? "\n⚠ INCONCLUSIVE — no videos scraped (Apify/Trigger issue); claim logic not exercised on real rows." :
    "\n✗ FAIL — see above.");
  if (!ok) process.exitCode = 1;
}

const args = new Set(process.argv.slice(2));
try {
  if (args.has("--teardown")) { console.log("MODE: --teardown\n"); await teardown(); }
  else await run();
} catch (err) {
  console.error("\nFATAL:", (err as Error).message);
  await teardown({ quiet: true }).catch(() => {});
  process.exit(1);
}
