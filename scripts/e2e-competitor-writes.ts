// ─────────────────────────────────────────────────────────────────────────
// E2E Competitor WRITE-side harness — sanctioned, per docs/production-db-guidelines.md
//
//   node --experimental-strip-types --import ./scripts/_alias-register.mjs \
//        scripts/e2e-competitor-writes.ts            # --live (default)
//   ...                                              scripts/e2e-competitor-writes.ts --teardown
//
// WHAT IT PROVES — drives the REAL src/lib/research/competitor.ts write functions
// (Session 9; server-only aliased away) against the Cleo-shared configs/creators/
// videos tables:
//   * createConfig / updateConfig / deleteConfig — new rows tagged to the client;
//     update/delete own-rows-only (wrong owner + legacy → 0 rows).
//   * createCreator / deleteCreator — same ownership guards.
//   * claimPipelineVideos — tags ONLY NULL videos matching configName + on/after
//     the run day; legacy (older day), wrong-config, and other-client rows are
//     never claimed.
//
// SAFETY: disposable e2e-cw@rumi.test; seeded videos carry `e2e-vid-` ids; the
// "other client" is a bogus uuid only ever tagged onto our OWN seeded rows.
// Teardown removes ONLY our seeded ids / owner uuids — legacy NULL rows (real
// Cleo data) are never touched. Baseline legacy counts asserted unchanged.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync } from "fs";
import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import {
  createConfig,
  updateConfig,
  deleteConfig,
  listConfigs,
  createCreator,
  deleteCreator,
  ownedCreatorIds,
  claimPipelineVideos,
} from "../src/lib/research/competitor.ts";

const env: Record<string, string> = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) { env[m[1]] = m[2].trim(); process.env[m[1]] = m[2].trim(); }
}
const seed = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const E2E_EMAIL = "e2e-cw@rumi.test";
const E2E_NAME = "E2E Competitor Writes";
const OTHER = "00000000-0000-4000-8000-0000000000d4";
const CFG_NAME = "e2e-claim-cfg";
const VID_IDS = ["e2e-vid-w1", "e2e-vid-w2", "e2e-vid-w3", "e2e-vid-w4", "e2e-vid-w5"];
const TODAY = new Date().toISOString().slice(0, 10);
const OLD_DAY = "2020-01-01";

const PROTECTED = new Set([
  "e19354ba-0988-4721-8fe2-d4ae983d8b9f",
  "c151a827-dd34-45d4-a887-89e291eaaa6a",
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
]);

function assertSafe(userId: string, email: string) {
  const e = (email || "").toLowerCase();
  if (e !== E2E_EMAIL) throw new Error(`refusing to act on ${email}`);
  if (!e.endsWith("@rumi.test")) throw new Error(`refusing to act on ${email}`);
  if (PROTECTED.has(userId)) throw new Error(`refusing to act on protected id ${userId}`);
}

async function findAuthUser(email: string) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await seed.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = data.users.find((u) => (u.email || "").toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

async function teardown({ quiet = false }: { quiet?: boolean } = {}) {
  const user = await findAuthUser(E2E_EMAIL);
  const prof = await seed.from("profiles").select("id,email").eq("email", E2E_EMAIL).maybeSingle();
  const userId = user?.id ?? prof.data?.id ?? null;
  // Seeded videos by id (some carry NULL client_id deliberately) + owner uuids.
  await seed.from("videos").delete().in("id", VID_IDS);
  if (userId) {
    await seed.from("videos").delete().eq("client_id", userId);
    await seed.from("videos").delete().eq("client_id", OTHER);
    await seed.from("configs").delete().eq("client_id", userId);
    await seed.from("creators").delete().eq("client_id", userId);
  }
  if (userId) {
    assertSafe(userId, user?.email ?? prof.data?.email ?? E2E_EMAIL);
    await seed.from("profiles").delete().eq("id", userId);
    if (user) {
      const { error } = await seed.auth.admin.deleteUser(userId);
      if (error && !/not found/i.test(error.message)) throw new Error(error.message);
    }
    if (!quiet) console.log(`  removed videos/configs/creators/profile/user for ${userId}`);
  } else if (!quiet) {
    console.log("  teardown: no user; cleared any seeded video ids");
  }
}

async function ensureAccount(): Promise<string> {
  let user = await findAuthUser(E2E_EMAIL);
  if (!user) {
    const { data, error } = await seed.auth.admin.createUser({
      email: E2E_EMAIL, password: randomBytes(32).toString("base64url"),
      email_confirm: true, user_metadata: { name: E2E_NAME },
    });
    if (error) throw new Error(`createUser failed: ${error.message}`);
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

const inputA = { configName: "e2e cfg A", creatorsCategory: "fit", analysisInstruction: "a", newConceptsInstruction: "b" };
const inputB = { configName: "e2e cfg B", creatorsCategory: "fit2", analysisInstruction: "a2", newConceptsInstruction: "b2" };

async function runLive() {
  console.log("MODE: --live (real configs/creators/videos writes; drives shipped competitor.ts)\n");
  await teardown({ quiet: true });
  const results: Record<string, boolean> = {};
  let clientId: string;

  // Legacy (NULL) config + creator to prove write-protection.
  const { data: legCfg } = await seed.from("configs").select("id").is("client_id", null).limit(1).maybeSingle();
  const { data: legCre } = await seed.from("creators").select("id").is("client_id", null).limit(1).maybeSingle();
  const legacyConfigId = legCfg ? String(legCfg.id) : null;
  const legacyCreatorId = legCre ? String(legCre.id) : null;
  const baseLegacyVideos = (await seed.from("videos").select("id", { count: "exact", head: true }).is("client_id", null)).count ?? 0;

  try {
    clientId = await ensureAccount();
    console.log(`seeded client ${clientId}\n`);

    // ── Configs ──
    const cfg = await createConfig(clientId, inputA);
    const created = cfg.clientId === clientId && !!cfg.id;
    const mine = await listConfigs(clientId);
    const other = await listConfigs(OTHER);
    const readScope = mine.some((c) => c.id === cfg.id) && !other.some((c) => c.id === cfg.id);
    const updWrong = await updateConfig(OTHER, cfg.id, inputB);
    const updLegacy = legacyConfigId ? await updateConfig(clientId, legacyConfigId, inputB) : 0;
    const updRight = await updateConfig(clientId, cfg.id, inputB);
    results.config = created && readScope && updWrong === 0 && updLegacy === 0 && updRight === 1;
    console.log(`1) config CRUD         : created ${created?"✓":"✗"} · scope ${readScope?"✓":"✗"} · update wrong ${updWrong}/legacy ${updLegacy}/right ${updRight} ${results.config?"✓":"✗"}`);
    const delWrong = await deleteConfig(OTHER, cfg.id);
    const delRight = await deleteConfig(clientId, cfg.id);
    results.configDelete = delWrong === 0 && delRight === 1;
    console.log(`2) config delete       : wrong ${delWrong} / right ${delRight} ${results.configDelete?"✓":"✗"}`);

    // ── Creators ──
    const cre = await createCreator(clientId, "@e2e_owned", "fit");
    const owned = await ownedCreatorIds(clientId);
    const creCreated = cre.clientId === clientId && owned.has(cre.id);
    const delCreWrong = await deleteCreator(OTHER, cre.id);
    const delCreLegacy = legacyCreatorId ? await deleteCreator(clientId, legacyCreatorId) : 0;
    const delCreRight = await deleteCreator(clientId, cre.id);
    results.creator = creCreated && delCreWrong === 0 && delCreLegacy === 0 && delCreRight === 1;
    console.log(`3) creator add/delete  : created ${creCreated?"✓":"✗"} · delete wrong ${delCreWrong}/legacy ${delCreLegacy}/right ${delCreRight} ${results.creator?"✓":"✗"}`);

    // ── Pipeline claim ──
    // 2 claimable (this config + today), 1 old-day (legacy-like), 1 wrong-config,
    // 1 other-client — all deliberately seeded.
    const vid = (id: string, cfgName: string, day: string, owner: string | null) => ({
      id, client_id: owner, creator: "e2e", views: 1, likes: 0, comments: 0,
      analysis: "", newConcepts: "", datePosted: day, dateAdded: day, configName: cfgName, starred: false,
    });
    const insV = await seed.from("videos").insert([
      vid(VID_IDS[0], CFG_NAME, TODAY, null),
      vid(VID_IDS[1], CFG_NAME, TODAY, null),
      vid(VID_IDS[2], CFG_NAME, OLD_DAY, null),       // old day → not claimed
      vid(VID_IDS[3], "other-cfg", TODAY, null),      // wrong config → not claimed
      vid(VID_IDS[4], CFG_NAME, TODAY, OTHER),        // other client → not claimed
    ]);
    if (insV.error) throw new Error(`video seed failed: ${insV.error.message}`);
    const claimed = await claimPipelineVideos(clientId, TODAY, CFG_NAME);
    const check = async (id: string) => String((await seed.from("videos").select("client_id").eq("id", id).maybeSingle()).data?.client_id ?? "null");
    const c0 = await check(VID_IDS[0]), c1 = await check(VID_IDS[1]);
    const c2 = await check(VID_IDS[2]), c3 = await check(VID_IDS[3]), c4 = await check(VID_IDS[4]);
    results.claim = claimed === 2 && c0 === clientId && c1 === clientId && c2 === "null" && c3 === "null" && c4 === OTHER;
    console.log(`4) pipeline claim      : claimed ${claimed} (2) · today→${c0===clientId&&c1===clientId?"me ✓":"✗"} · old ${c2==="null"?"skipped ✓":"✗"} · wrong-cfg ${c3==="null"?"skipped ✓":"✗"} · other ${c4===OTHER?"kept ✓":"✗"} ${results.claim?"✓":"✗"}`);

    // ── Legacy videos untouched ──
    const nowLegacy = (await seed.from("videos").select("id", { count: "exact", head: true }).is("client_id", null)).count ?? 0;
    // Our old-day + wrong-cfg NULL seeds (2) are still NULL, so expected = base + 2.
    results.legacySafe = nowLegacy === baseLegacyVideos + 2;
    console.log(`5) legacy videos       : NULL count ${baseLegacyVideos}→${nowLegacy} (expect +2 from our NULL seeds) ${results.legacySafe?"✓":"✗"}`);
  } catch (err) {
    console.error("FATAL:", (err as Error).message);
    await teardown({ quiet: true }).catch(() => {});
    process.exit(1);
  }

  console.log("\nTearing down…");
  await teardown();
  const gone = await findAuthUser(E2E_EMAIL);
  const finalLegacy = (await seed.from("videos").select("id", { count: "exact", head: true }).is("client_id", null)).count ?? 0;

  const ok = Object.values(results).every(Boolean) && !gone && finalLegacy === baseLegacyVideos;
  console.log("\n─── VERDICT ───");
  for (const [k, v] of Object.entries(results)) console.log(`${k.padEnd(13)}: ${v ? "PASS" : "FAIL"}`);
  console.log(`cleanup      : ${gone ? "STILL EXISTS (!!)" : "clean"} · legacy videos ${finalLegacy === baseLegacyVideos ? "intact" : "CHANGED (!!)"}`);
  console.log(ok ? "\n✓ ALL PASS — per-client write scoping + claim verified; legacy data intact." : "\n✗ FAIL — see above.");
  if (!ok) process.exitCode = 1;
}

const args = new Set(process.argv.slice(2));
try {
  if (args.has("--teardown")) { console.log("MODE: --teardown\n"); await teardown(); }
  else await runLive();
} catch (err) {
  console.error("\nFATAL:", (err as Error).message);
  await teardown({ quiet: true }).catch(() => {});
  process.exit(1);
}
