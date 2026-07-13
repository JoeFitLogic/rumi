// ─────────────────────────────────────────────────────────────────────────
// E2E Competitor scoping harness — sanctioned, per docs/production-db-guidelines.md
//
//   node --experimental-strip-types --import ./scripts/_alias-register.mjs \
//        scripts/e2e-competitor.ts            # --live (default): real DB writes
//   ...                                       scripts/e2e-competitor.ts --teardown
//
// WHAT IT PROVES — drives the REAL src/lib/research/competitor.ts functions
// (imported, not reimplemented; server-only aliased away) against seeded rows in
// the Cleo-shared `videos` table, after migration 0012:
//   * listVideos(A)      → this client's OWN rows + legacy/global (NULL) rows,
//                          and EXCLUDES another client's rows.
//   * setVideoStar / deleteVideo → this client's OWN rows only. A legacy/global
//     (NULL) row and another client's row change 0 rows — never mutated.
//   * clearOwnVideos(A)  → removes ONLY this client's rows; legacy + other-client
//     rows survive; the pre-existing legacy row-count is unchanged end-to-end.
//
// SAFETY: disposable e2e-competitor@rumi.test; seeded videos carry text ids
// prefixed `e2e-vid-`; the "other client" is a bogus uuid we only ever tag our
// OWN seeded row with. Teardown deletes ONLY rows whose client_id is A or that
// bogus uuid — legacy NULL rows (real Cleo data) are never touched. Idempotent,
// runs first + on failure. Baseline legacy count asserted unchanged.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync } from "fs";
import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import {
  listVideos,
  setVideoStar,
  deleteVideo,
  clearOwnVideos,
} from "../src/lib/research/competitor.ts";

const env: Record<string, string> = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) { env[m[1]] = m[2].trim(); process.env[m[1]] = m[2].trim(); }
}
const seed = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const E2E_EMAIL = "e2e-competitor@rumi.test";
const E2E_NAME = "E2E Competitor";
const OTHER = "00000000-0000-4000-8000-0000000000c3"; // bogus "other client"
const A_IDS = ["e2e-vid-a1", "e2e-vid-a2", "e2e-vid-a3"];
const B_ID = "e2e-vid-b1";

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
  // Videos are keyed by our seeded ids / owner uuids — delete those regardless of
  // whether the user row still exists. NEVER touch legacy NULL rows.
  const delA = await seed.from("videos").delete().in("id", [...A_IDS, B_ID]).select("id");
  if (delA.error) throw new Error(`delete seeded videos failed: ${delA.error.message}`);
  if (userId) {
    await seed.from("videos").delete().eq("client_id", userId).select("id");
    await seed.from("videos").delete().eq("client_id", OTHER).select("id");
  }
  if (!quiet) console.log(`  videos removed: ${delA.data?.length ?? 0} seeded`);
  if (userId) {
    assertSafe(userId, user?.email ?? prof.data?.email ?? E2E_EMAIL);
    await seed.from("profiles").delete().eq("id", userId);
    if (user) {
      const { error } = await seed.auth.admin.deleteUser(userId);
      if (error && !/not found/i.test(error.message)) throw new Error(error.message);
    }
    if (!quiet) console.log(`  profile + auth user removed`);
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

async function legacyCount(): Promise<number> {
  const { count } = await seed
    .from("videos")
    .select("id", { count: "exact", head: true })
    .is("client_id", null);
  return count ?? 0;
}

async function runLive() {
  console.log("MODE: --live (real videos writes; drives the shipped competitor.ts)\n");
  await teardown({ quiet: true });

  const results: Record<string, boolean> = {};
  let clientId: string;
  const baselineLegacy = await legacyCount();

  // Pick a real legacy (NULL) video to prove it's read-visible but write-protected.
  const { data: legacyRow } = await seed
    .from("videos").select("id, starred").is("client_id", null).limit(1).maybeSingle();
  if (!legacyRow) throw new Error("no legacy (NULL client_id) video to test against.");
  const legacyId = String(legacyRow.id);
  const legacyStarredBefore = legacyRow.starred === true;

  try {
    clientId = await ensureAccount();
    const rows = [
      ...A_IDS.map((id, i) => ({
        id, client_id: clientId, creator: "e2e_owned", views: 100 + i,
        likes: 1, comments: 0, analysis: "HOOK: owned test video", newConcepts: "", starred: false,
      })),
      { id: B_ID, client_id: OTHER, creator: "e2e_other", views: 50, likes: 0, comments: 0, analysis: "", newConcepts: "", starred: false },
    ];
    const ins = await seed.from("videos").insert(rows).select("id");
    if (ins.error) throw new Error(`seed insert failed: ${ins.error.message}`);
    console.log(`seeded client ${clientId}: ${A_IDS.length} owned + 1 other-client video`);
    console.log(`baseline legacy videos: ${baselineLegacy}\n`);

    // 1) READ scope — own + legacy, excludes other client
    const list = await listVideos(clientId);
    const ids = new Set(list.map((v) => v.id));
    const ownAllVisible = A_IDS.every((id) => ids.has(id));
    const legacyVisible = ids.has(legacyId);
    const otherHidden = !ids.has(B_ID);
    results.readScope = ownAllVisible && legacyVisible && otherHidden;
    console.log(`1) listVideos scope    : own ${ownAllVisible ? "✓" : "✗"} · legacy visible ${legacyVisible ? "✓" : "✗"} · other-client hidden ${otherHidden ? "✓" : "✗"}`);

    // 2) STAR — own only
    const starOwn = await setVideoStar(clientId, A_IDS[0], true);
    const starLegacy = await setVideoStar(clientId, legacyId, true);
    const starOther = await setVideoStar(clientId, B_ID, true);
    results.starScope = starOwn === 1 && starLegacy === 0 && starOther === 0;
    console.log(`2) setVideoStar        : own ${starOwn} (1) · legacy ${starLegacy} (0) · other ${starOther} (0) ${results.starScope ? "✓" : "✗"}`);

    // 3) DELETE — own only
    const delLegacy = await deleteVideo(clientId, legacyId);
    const delOther = await deleteVideo(clientId, B_ID);
    const delOwn = await deleteVideo(clientId, A_IDS[0]);
    results.deleteScope = delLegacy === 0 && delOther === 0 && delOwn === 1;
    console.log(`3) deleteVideo         : legacy ${delLegacy} (0) · other ${delOther} (0) · own ${delOwn} (1) ${results.deleteScope ? "✓" : "✗"}`);

    // 4) CLEAR — own only (2 owned remain after the delete above)
    const cleared = await clearOwnVideos(clientId);
    const after = await listVideos(clientId);
    const noOwnLeft = A_IDS.every((id) => !after.some((v) => v.id === id));
    const bStillThere = (await seed.from("videos").select("id").eq("id", B_ID).maybeSingle()).data != null;
    results.clearScope = cleared === 2 && noOwnLeft && bStillThere;
    console.log(`4) clearOwnVideos      : cleared ${cleared} (2) · own gone ${noOwnLeft ? "✓" : "✗"} · other survives ${bStillThere ? "✓" : "✗"} ${results.clearScope ? "✓" : "✗"}`);

    // 5) LEGACY UNTOUCHED — the real row's starred flag + total legacy count unchanged
    const { data: legacyAfter } = await seed.from("videos").select("starred").eq("id", legacyId).maybeSingle();
    const legacyStarredAfter = legacyAfter?.starred === true;
    const legacyNow = await legacyCount();
    results.legacySafe = legacyStarredAfter === legacyStarredBefore && legacyNow === baselineLegacy;
    console.log(`5) legacy untouched    : starred ${legacyStarredBefore}→${legacyStarredAfter} · count ${baselineLegacy}→${legacyNow} ${results.legacySafe ? "✓" : "✗"}`);
  } catch (err) {
    console.error("FATAL:", (err as Error).message);
    await teardown({ quiet: true }).catch(() => {});
    process.exit(1);
  }

  console.log("\nTearing down…");
  await teardown();
  const gone = await findAuthUser(E2E_EMAIL);
  const legacyFinal = await legacyCount();

  const ok = Object.values(results).every(Boolean) && !gone && legacyFinal === baselineLegacy;
  console.log("\n─── VERDICT ───");
  for (const [k, v] of Object.entries(results)) console.log(`${k.padEnd(14)}: ${v ? "PASS" : "FAIL"}`);
  console.log(`cleanup       : ${gone ? "STILL EXISTS (!!)" : "clean"} · legacy ${legacyFinal === baselineLegacy ? "intact" : "CHANGED (!!)"}`);
  console.log(ok ? "\n✓ ALL PASS — per-client read + own-rows-only writes verified; legacy data intact." : "\n✗ FAIL — see above.");
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
