// ─────────────────────────────────────────────────────────────────────────
// E2E Content Bank harness — sanctioned, per docs/production-db-guidelines.md
//
//   node scripts/e2e-content-bank.mjs            # --live (default): real DB writes, no AI
//   node scripts/e2e-content-bank.mjs --teardown # remove all E2E rows (idempotent)
//
// WHAT IT PROVES (against a disposable e2e-content-bank@rumi.test client)
//   The Content Bank data path over the Cleo-shared `content_ideas` table
//   (owner column client_id): owner-filtered LIST, inline STATUS + NOTES update,
//   DELETE, and — critically — CROSS-TENANT ISOLATION: every mutation is scoped
//   `.eq(id).eq(client_id)`, so a wrong owner changes 0 rows and another
//   client's rows are invisible. Mirrors src/app/(app)/script-studio/
//   contentBankActions.ts (the actions themselves are "use server" + getActiveClient,
//   which can't be imported into plain node — same reason as e2e-script-studio).
//
// SAFETY: fixed disposable identity; every write guarded by email == identity
//   AND @rumi.test AND id ∉ PROTECTED. Idempotent teardown runs first + on failure.
//   The "other client" is a BOGUS uuid we only ever READ/UPDATE against (never
//   insert), so no real account and no Priya/Marcus seed is ever touched.
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

const E2E_EMAIL = "e2e-content-bank@rumi.test";
const E2E_NAME = "E2E Content Bank";
// A uuid that belongs to NO account — stands in for "another client". We only
// ever read/update against it (never insert), so it can't touch a real row.
const OTHER_CLIENT = "00000000-0000-4000-8000-0000000000b2";

const PROTECTED_IDS = new Set([
  "e19354ba-0988-4721-8fe2-d4ae983d8b9f",
  "c151a827-dd34-45d4-a887-89e291eaaa6a",
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
]);

function assertSafe(userId, email) {
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
  if (!userId) { if (!quiet) console.log(`teardown: nothing to remove.`); return; }
  assertSafe(userId, user?.email ?? prof.data?.email ?? E2E_EMAIL);
  for (const [tbl, col] of [["content_ideas", "client_id"], ["profiles", "id"]]) {
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
  assertSafe(user.id, user.email);
  const { error } = await admin.from("profiles").insert({
    id: user.id, email: E2E_EMAIL, name: E2E_NAME, role: "client",
    account_status: "active", onboarding_complete: true,
  });
  if (error) {
    await admin.from("profiles").update({ name: E2E_NAME, account_status: "active" }).eq("id", user.id);
  }
  return user.id;
}

const SEED = [
  { title: "The maths in your head", hook: "You shouldn't need a spreadsheet to eat lunch.", pillar: "Perspective", format: "Reel", source: "Client Interactions", status: "idea" },
  { title: "Shouting into the void", hook: "You logged 1,400 calories. Nobody saw it.", pillar: "Proof", format: "Carousel", source: "External Forums", status: "idea" },
  { title: "You're not broken", hook: "Three years of tracking isn't willpower — it's a trap.", pillar: "Personal", format: "B-roll", source: "Analytics", status: "idea" },
];

async function runLive() {
  console.log("MODE: --live (real content_ideas writes; no AI)\n");
  await teardown({ quiet: true });
  const results = {};
  let clientId;
  try {
    clientId = await ensureAccount();
    const rows = SEED.map((s) => ({ client_id: clientId, ...s }));
    const { error } = await admin.from("content_ideas").insert(rows);
    if (error) throw new Error(`seed insert failed: ${error.message}`);
    console.log(`seeded client ${clientId} with ${rows.length} ideas\n`);

    const SEL = "id, client_id, title, hook, pillar, format, source, angle, status, notes, created_at, updated_at";

    // 1) Owner-filtered LIST
    const { data: mine } = await admin.from("content_ideas").select(SEL).eq("client_id", clientId).order("created_at", { ascending: false });
    results.list = (mine?.length ?? 0) === 3;
    console.log(`1) owner list          : ${mine?.length} rows (expect 3) ${results.list ? "✓" : "✗"}`);

    // 2) Cross-tenant read isolation — another client sees none of ours
    const { data: theirs } = await admin.from("content_ideas").select("id").eq("client_id", OTHER_CLIENT);
    results.readIsolation = (theirs?.length ?? 0) === 0;
    console.log(`2) other-client read   : ${theirs?.length} rows (expect 0) ${results.readIsolation ? "✓" : "✗"}`);

    const target = mine[0];

    // 3) STATUS update — wrong owner changes nothing, correct owner works
    const wrongStatus = await admin.from("content_ideas").update({ status: "published" }).eq("id", target.id).eq("client_id", OTHER_CLIENT).select("id");
    const rightStatus = await admin.from("content_ideas").update({ status: "scripted" }).eq("id", target.id).eq("client_id", clientId).select("id, status");
    results.statusGuard = (wrongStatus.data?.length ?? 0) === 0 && (rightStatus.data?.length ?? 0) === 1 && rightStatus.data[0].status === "scripted";
    console.log(`3) status update       : wrong-owner ${wrongStatus.data?.length} / right-owner ${rightStatus.data?.length}→${rightStatus.data?.[0]?.status} ${results.statusGuard ? "✓" : "✗"}`);

    // 4) NOTES update — same guard
    const note = "Film after the Tuesday call.";
    const wrongNote = await admin.from("content_ideas").update({ notes: "HACKED" }).eq("id", target.id).eq("client_id", OTHER_CLIENT).select("id");
    const rightNote = await admin.from("content_ideas").update({ notes: note }).eq("id", target.id).eq("client_id", clientId).select("id, notes");
    results.notesGuard = (wrongNote.data?.length ?? 0) === 0 && rightNote.data?.[0]?.notes === note;
    console.log(`4) notes update        : wrong-owner ${wrongNote.data?.length} / right-owner note="${rightNote.data?.[0]?.notes}" ${results.notesGuard ? "✓" : "✗"}`);

    // 5) DELETE — wrong owner deletes nothing, correct owner removes exactly one
    const wrongDel = await admin.from("content_ideas").delete().eq("id", target.id).eq("client_id", OTHER_CLIENT).select("id");
    const rightDel = await admin.from("content_ideas").delete().eq("id", target.id).eq("client_id", clientId).select("id");
    const { data: after } = await admin.from("content_ideas").select("id").eq("client_id", clientId);
    results.deleteGuard = (wrongDel.data?.length ?? 0) === 0 && (rightDel.data?.length ?? 0) === 1 && (after?.length ?? 0) === 2;
    console.log(`5) delete              : wrong-owner ${wrongDel.data?.length} / right-owner ${rightDel.data?.length}, remaining ${after?.length} (expect 2) ${results.deleteGuard ? "✓" : "✗"}`);
  } catch (err) {
    console.error("FATAL:", err.message);
    await teardown({ quiet: true }).catch(() => {});
    process.exit(1);
  }

  console.log("\nTearing down…");
  await teardown();
  const gone = await findAuthUser(E2E_EMAIL);

  const ok = Object.values(results).every(Boolean) && !gone;
  console.log("\n─── VERDICT ───");
  for (const [k, v] of Object.entries(results)) console.log(`${k.padEnd(16)}: ${v ? "PASS" : "FAIL"}`);
  console.log("cleanup         :", gone ? "STILL EXISTS (!!)" : "clean");
  console.log(ok ? "\n✓ ALL PASS — owner-scoping + cross-tenant isolation verified, no rows left." : "\n✗ FAIL — see above.");
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
