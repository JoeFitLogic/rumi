// ─────────────────────────────────────────────────────────────────────────
// E2E TENANT-ISOLATION harness — sanctioned, per docs/production-db-guidelines.md
//
//   node --experimental-strip-types --import ./scripts/_alias-register.mjs \
//        scripts/e2e-tenant-isolation.ts             # --live (default)
//   ...                                              scripts/e2e-tenant-isolation.ts --teardown
//
// WHAT IT PROVES (Session 10, Item 2 — multi-tenant correctness):
// SMAI's pipeline scrapes EVERY creator in the shared table regardless of the
// triggering config's category, so one run produces NULL-tagged videos for
// creators that belong to OTHER clients. This harness proves the Rumi-side
// ownership guard in competitor.ts:claimPipelineVideos makes cross-tenant video
// OWNERSHIP impossible: a run/claim by tenant A never pulls a video whose creator
// is owned exclusively by tenant B, and vice-versa. Shared/legacy-creator videos
// (creators.client_id NULL) stay claimable by whoever claims first.
//
// Scenario — two disposable tenants, each owning one creator, plus one shared
// (NULL) creator. We seed NULL-tagged videos for ALL THREE creators under the
// same configName + day (mimicking SMAI's over-broad scrape), then:
//   1. Tenant A claims  → gets its own creator's video + the shared one; NEVER B's.
//   2. Tenant B claims  → gets its own creator's video only (shared already taken).
//   * Legacy NULL-video baseline count returns to exactly where it started.
//
// SAFETY: disposable e2e-tiA@rumi.test / e2e-tiB@rumi.test; seeded videos carry
// `e2e-ti-` ids; teardown removes ONLY our seeded ids + owner uuids. Real Cleo
// NULL rows are never touched; baseline legacy count asserted unchanged.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync } from "fs";
import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import {
  createCreator,
  deleteCreator,
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

const TENANTS = [
  { email: "e2e-tia@rumi.test", name: "E2E Tenant A", creator: "ti_creator_a" },
  { email: "e2e-tib@rumi.test", name: "E2E Tenant B", creator: "ti_creator_b" },
];
const SHARED_CREATOR = "ti_legacy_shared"; // NULL-client creator, claimable by anyone
const CFG_NAME = "e2e-ti-cfg";
const TODAY = new Date().toISOString().slice(0, 10);
const VID = {
  a: "e2e-ti-vid-a",       // creator ti_creator_a  → A only
  b: "e2e-ti-vid-b",       // creator ti_creator_b  → B only
  shared: "e2e-ti-vid-s",  // creator ti_legacy_shared → first claimer
};
const SHARED_CREATOR_ID = "e2e-ti-cre-shared";

const PROTECTED = new Set([
  "e19354ba-0988-4721-8fe2-d4ae983d8b9f",
  "c151a827-dd34-45d4-a887-89e291eaaa6a",
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
]);

function assertSafe(userId: string, email: string) {
  const e = (email || "").toLowerCase();
  if (!TENANTS.some((t) => t.email === e)) throw new Error(`refusing to act on ${email}`);
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
  // Seeded videos + shared creator by id (independent of any user).
  await seed.from("videos").delete().in("id", [VID.a, VID.b, VID.shared]);
  await seed.from("creators").delete().eq("id", SHARED_CREATOR_ID);
  for (const t of TENANTS) {
    const user = await findAuthUser(t.email);
    const prof = await seed.from("profiles").select("id,email").eq("email", t.email).maybeSingle();
    const userId = user?.id ?? prof.data?.id ?? null;
    if (userId) {
      await seed.from("videos").delete().eq("client_id", userId);
      await seed.from("creators").delete().eq("client_id", userId);
      assertSafe(userId, user?.email ?? prof.data?.email ?? t.email);
      await seed.from("profiles").delete().eq("id", userId);
      if (user) {
        const { error } = await seed.auth.admin.deleteUser(userId);
        if (error && !/not found/i.test(error.message)) throw new Error(error.message);
      }
      if (!quiet) console.log(`  removed data + profile/user for ${t.email} (${userId})`);
    }
  }
  if (quiet) return;
}

async function ensureAccount(email: string, name: string): Promise<string> {
  let user = await findAuthUser(email);
  if (!user) {
    const { data, error } = await seed.auth.admin.createUser({
      email, password: randomBytes(32).toString("base64url"),
      email_confirm: true, user_metadata: { name },
    });
    if (error) throw new Error(`createUser failed: ${error.message}`);
    user = data.user;
  }
  assertSafe(user.id, user.email ?? "");
  const { error } = await seed.from("profiles").insert({
    id: user.id, email, name, role: "client",
    account_status: "active", onboarding_complete: true,
  });
  if (error) await seed.from("profiles").update({ name }).eq("id", user.id);
  return user.id;
}

const vidRow = (id: string, creator: string) => ({
  id, client_id: null, creator, views: 1, likes: 0, comments: 0,
  analysis: "", newConcepts: "", datePosted: TODAY, dateAdded: TODAY,
  configName: CFG_NAME, starred: false,
});

async function runLive() {
  console.log("MODE: --live (two disposable tenants; drives shipped competitor.ts claim guard)\n");
  await teardown({ quiet: true });
  const results: Record<string, boolean> = {};

  const baseLegacy = (await seed.from("videos").select("id", { count: "exact", head: true }).is("client_id", null)).count ?? 0;

  try {
    const idA = await ensureAccount(TENANTS[0].email, TENANTS[0].name);
    const idB = await ensureAccount(TENANTS[1].email, TENANTS[1].name);
    console.log(`tenant A ${idA}\ntenant B ${idB}\n`);

    // Each tenant owns exactly one creator; one shared (NULL) creator exists too.
    await createCreator(idA, `@${TENANTS[0].creator}`, "cat");
    await createCreator(idB, `@${TENANTS[1].creator}`, "cat");
    const insCre = await seed.from("creators").insert({
      id: SHARED_CREATOR_ID, client_id: null, username: SHARED_CREATOR, category: "cat",
      profilePicUrl: "", followers: 0, reelsCount30d: 0, avgViews30d: 0, lastScrapedAt: "",
    });
    if (insCre.error) throw new Error(`shared creator seed failed: ${insCre.error.message}`);

    // SMAI's over-broad scrape: one NULL-tagged video per creator, same cfg + day.
    const insV = await seed.from("videos").insert([
      vidRow(VID.a, TENANTS[0].creator),
      vidRow(VID.b, TENANTS[1].creator),
      vidRow(VID.shared, SHARED_CREATOR),
    ]);
    if (insV.error) throw new Error(`video seed failed: ${insV.error.message}`);

    const owner = async (id: string) =>
      String((await seed.from("videos").select("client_id").eq("id", id).maybeSingle()).data?.client_id ?? "null");

    // ── Tenant A claims first ──
    const claimedA = await claimPipelineVideos(idA, TODAY, CFG_NAME);
    const aOwnsA = (await owner(VID.a)) === idA;
    const aOwnsShared = (await owner(VID.shared)) === idA;
    const bStillNull = (await owner(VID.b)) === "null"; // A must NOT touch B's creator video
    results.tenantA = claimedA === 2 && aOwnsA && aOwnsShared && bStillNull;
    console.log(`1) tenant A claim      : claimed ${claimedA} (2) · own-creator ${aOwnsA?"✓":"✗"} · shared ${aOwnsShared?"✓":"✗"} · B's video untouched ${bStillNull?"✓":"✗"} ${results.tenantA?"PASS":"FAIL"}`);

    // ── Cross-tenant isolation assertion (the core proof) ──
    const bVidOwner = await owner(VID.b);
    results.isolation = bVidOwner === "null" || bVidOwner === idB; // never A
    console.log(`2) isolation (B≠A)     : B's video owner is ${bVidOwner === idA ? "TENANT A (!!)" : "not A"} ${results.isolation?"PASS":"FAIL"}`);

    // ── Tenant B claims → its own creator's video only ──
    const claimedB = await claimPipelineVideos(idB, TODAY, CFG_NAME);
    const bOwnsB = (await owner(VID.b)) === idB;
    const aKeptA = (await owner(VID.a)) === idA;       // B must NOT steal A's already-claimed video
    const sharedKeptA = (await owner(VID.shared)) === idA; // shared already A's; B can't take it
    results.tenantB = claimedB === 1 && bOwnsB && aKeptA && sharedKeptA;
    console.log(`3) tenant B claim      : claimed ${claimedB} (1) · own-creator ${bOwnsB?"✓":"✗"} · A's video kept ${aKeptA?"✓":"✗"} · shared kept by A ${sharedKeptA?"✓":"✗"} ${results.tenantB?"PASS":"FAIL"}`);

    // ── Legacy NULL videos untouched ──
    const nowLegacy = (await seed.from("videos").select("id", { count: "exact", head: true }).is("client_id", null)).count ?? 0;
    results.legacySafe = nowLegacy === baseLegacy; // all 3 seeds now owned → back to baseline
    console.log(`4) legacy videos       : NULL count ${baseLegacy}→${nowLegacy} (expect unchanged) ${results.legacySafe?"PASS":"FAIL"}`);
  } catch (err) {
    console.error("FATAL:", (err as Error).message);
    await teardown({ quiet: true }).catch(() => {});
    process.exit(1);
  }

  console.log("\nTearing down…");
  await teardown();
  const goneA = await findAuthUser(TENANTS[0].email);
  const goneB = await findAuthUser(TENANTS[1].email);
  const finalLegacy = (await seed.from("videos").select("id", { count: "exact", head: true }).is("client_id", null)).count ?? 0;

  const ok = Object.values(results).every(Boolean) && !goneA && !goneB && finalLegacy === baseLegacy;
  console.log("\n─── VERDICT ───");
  for (const [k, v] of Object.entries(results)) console.log(`${k.padEnd(11)}: ${v ? "PASS" : "FAIL"}`);
  console.log(`cleanup    : ${goneA || goneB ? "STILL EXISTS (!!)" : "clean"} · legacy videos ${finalLegacy === baseLegacy ? "intact" : "CHANGED (!!)"}`);
  console.log(ok ? "\n✓ ALL PASS — cross-tenant claim isolation verified; legacy data intact." : "\n✗ FAIL — see above.");
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
