// ─────────────────────────────────────────────────────────────────────────
// E2E RAG health-scoring harness — sanctioned, per docs/production-db-guidelines.md
//
//   node --experimental-strip-types --import ./scripts/_alias-register.mjs \
//        scripts/e2e-health.ts              # seed → assert → teardown
//   ...                                     scripts/e2e-health.ts --keep
//   ...                                     scripts/e2e-health.ts --teardown
//
// WHAT IT PROVES — drives the REAL src/lib/health.ts (imported, not
// reimplemented) over rows actually read back out of production Supabase with
// the SAME select strings the pages use. Three disposable clients, each seeded
// to land in a different band:
//   * GREEN   90% calls attended, checked in today, 8 videos, 6 scripts
//   * RED     40% calls attended, checked in 20 days ago, 2 videos, 1 script
//   * NEUTRAL 0 calls offered → the divide-by-zero case must NOT read red
//
// All four metrics share ONE window — the week of the client's latest check-in
// ([week_starting, +7d)). The RED fixture proves it: its check-in is 20 days
// old, so its seeded scripts are written into THAT week, not the current one.
// A script created today would correctly count 0 for it.
//
// SAFETY
//   • Three fixed disposable @rumi.test identities, get-or-created by email.
//   • Every write/delete is guarded: the target email MUST be one of ours and
//     MUST end with @rumi.test, and its id MUST NOT be in PROTECTED_IDS — which
//     includes the Priya/Marcus demo seeds from sql/0005.
//   • Teardown runs FIRST for a clean slate, again on any seeding error, and
//     again at the end unless --keep. Children before parents.
//   • `scripts` is a Cleo-shared table with 1500+ real rows. Seeded script rows
//     are deleted by user_id (our disposable users only) and are additionally
//     tagged in `topic` so they are identifiable if anything ever escapes.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync } from "fs";
import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import {
  clientHealth,
  countScriptsInWindow,
  latestCheckin,
  startOfWeek,
  weekWindow,
  type HealthCheckinRow,
  type HealthScriptRow,
  type Rag,
} from "@/lib/health";

// ── env (.env.local is CRLF; trim strips stray \r) ──
const env: Record<string, string> = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const SCRIPT_TAG = "[E2E HEALTH] disposable fixture";

// ── fixed disposable identities ──
interface Fixture {
  email: string;
  name: string;
  /** Days ago the check-in was submitted. */
  submittedDaysAgo: number;
  callsOffered: number;
  callsAttended: number;
  contentVolume: number;
  followersGained: number;
  scriptsThisWeek: number;
  /** Expected RAG per metric, in health.ts order: calls, recency, videos, scripts. */
  expect: [Rag, Rag, Rag, Rag];
}

const FIXTURES: Fixture[] = [
  {
    email: "e2e-health-green@rumi.test",
    name: "E2E Health Green",
    submittedDaysAgo: 0,
    callsOffered: 10,
    callsAttended: 9, // 90% → green (>= 85)
    contentVolume: 8, // → green (>= 6)
    followersGained: 120,
    scriptsThisWeek: 6, // → green (>= 6)
    expect: ["green", "green", "green", "green"],
  },
  {
    email: "e2e-health-red@rumi.test",
    name: "E2E Health Red",
    submittedDaysAgo: 20, // → red (> 14)
    callsOffered: 10,
    callsAttended: 4, // 40% → red (< 60)
    contentVolume: 2, // → red (<= 3)
    followersGained: 5,
    scriptsThisWeek: 1, // → red (<= 3)
    expect: ["red", "red", "red", "red"],
  },
  {
    email: "e2e-health-neutral@rumi.test",
    name: "E2E Health Neutral",
    submittedDaysAgo: 1,
    callsOffered: 0, // divide-by-zero → neutral, NOT red
    callsAttended: 0,
    contentVolume: 7,
    followersGained: 40,
    scriptsThisWeek: 5, // 4-5 → amber
    expect: ["neutral", "green", "green", "amber"],
  },
];

const OUR_EMAILS = new Set(FIXTURES.map((f) => f.email));

// ── accounts that must NEVER be touched ──
const PROTECTED_IDS = new Set([
  "e19354ba-0988-4721-8fe2-d4ae983d8b9f", // joe@fitlogicsystems.co.uk
  "c151a827-dd34-45d4-a887-89e291eaaa6a", // info@contentcoachhq.com
  "11111111-1111-4111-8111-111111111111", // seed-one@rumi.test  (Priya demo seed)
  "22222222-2222-4222-8222-222222222222", // seed-two@rumi.test  (Marcus demo seed)
]);

function assertSafeTarget(userId: string, email: string | null | undefined) {
  const e = (email || "").toLowerCase();
  if (!OUR_EMAILS.has(e)) throw new Error(`refusing to act on ${email} — not an E2E health identity`);
  if (!e.endsWith("@rumi.test")) throw new Error(`refusing to act on ${email} — not @rumi.test`);
  if (PROTECTED_IDS.has(userId)) throw new Error(`refusing to act on protected id ${userId}`);
}

async function findAuthUser(email: string) {
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
async function teardownOne(email: string, quiet: boolean) {
  const user = await findAuthUser(email);
  const { data: prof } = await admin.from("profiles").select("id,email").eq("email", email).maybeSingle();
  const userId = user?.id ?? prof?.id ?? null;
  if (!userId) return;

  assertSafeTarget(userId, user?.email ?? prof?.email ?? email);

  for (const [tbl, col] of [
    ["scripts", "user_id"],
    ["checkin_responses", "user_id"],
    ["profiles", "id"],
  ] as const) {
    const { data, error } = await admin.from(tbl).delete().eq(col, userId).select("id");
    if (error) throw new Error(`delete ${tbl} failed: ${error.message}`);
    if (!quiet && data.length) console.log(`  ${email} ${tbl}: ${data.length} deleted`);
  }
  if (user) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && !/not found/i.test(error.message)) throw new Error(`deleteUser failed: ${error.message}`);
    if (!quiet) console.log(`  ${email} auth.users: 1 deleted`);
  }
}

async function teardown({ quiet = false } = {}) {
  for (const f of FIXTURES) await teardownOne(f.email, quiet);
}

// ── seeding ──
async function ensureAccount(f: Fixture): Promise<string> {
  let user = await findAuthUser(f.email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: f.email,
      password: randomBytes(32).toString("base64url"),
      email_confirm: true,
      user_metadata: { name: f.name },
    });
    if (error) throw new Error(`createUser failed: ${error.message}`);
    user = data.user;
  }
  assertSafeTarget(user.id, user.email);

  const { error: insErr } = await admin.from("profiles").insert({
    id: user.id, email: f.email, name: f.name, role: "client",
    account_status: "active", onboarding_complete: true,
  });
  if (insErr) {
    const { error: updErr } = await admin.from("profiles")
      .update({ email: f.email, name: f.name, account_status: "active" })
      .eq("id", user.id);
    if (updErr) throw new Error(`profile upsert failed: ${updErr.message}`);
  }
  return user.id;
}

function isoDaysAgo(days: number, now: Date): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

async function seed(f: Fixture, now: Date): Promise<string> {
  const userId = await ensureAccount(f);
  const submittedAt = isoDaysAgo(f.submittedDaysAgo, now);

  // week_starting tracks the submission, so the latest row is the one scored.
  const weekStarting = startOfWeek(new Date(submittedAt)).toISOString().slice(0, 10);

  const { error: cErr } = await admin.from("checkin_responses").insert({
    user_id: userId,
    week_starting: weekStarting,
    created_at: submittedAt,
    calls_offered: f.callsOffered,
    calls_attended: f.callsAttended,
    content_volume: f.contentVolume,
    followers_gained: f.followersGained,
  });
  if (cErr) throw new Error(`checkin insert failed: ${cErr.message}`);

  if (f.scriptsThisWeek > 0) {
    // Written INSIDE the check-in's own week window (one hour past its start),
    // which for the RED fixture is three weeks ago — not the current week.
    const w = weekWindow({ week_starting: weekStarting } as HealthCheckinRow, now);
    const createdAt = new Date(w.start.getTime() + 3_600_000).toISOString();
    const rows = Array.from({ length: f.scriptsThisWeek }, (_, i) => ({
      user_id: userId,
      topic: `${SCRIPT_TAG} ${i + 1}`,
      generated_script: `${SCRIPT_TAG} — placeholder body, safe to delete.`,
      status: "drafted",
      created_at: createdAt,
    }));
    const { error: sErr } = await admin.from("scripts").insert(rows);
    if (sErr) throw new Error(`scripts insert failed: ${sErr.message}`);
  }

  return userId;
}

// ── verification: read back with the pages' select strings, score with the
//    real helper, compare against the expected bands ──
async function verify(f: Fixture, userId: string, now: Date) {
  const { data: checkinRows, error: cErr } = await admin
    .from("checkin_responses")
    .select("week_starting, created_at, calls_attended, calls_offered, content_volume, followers_gained")
    .eq("user_id", userId)
    .order("week_starting", { ascending: false });
  if (cErr) throw new Error(`checkin read failed: ${cErr.message}`);

  const latest = latestCheckin((checkinRows ?? []) as HealthCheckinRow[]);
  const w = weekWindow(latest, now);

  const { data: scriptRows, error: sErr } = await admin
    .from("scripts")
    .select("created_at")
    .eq("user_id", userId)
    .gte("created_at", w.start.toISOString())
    .lt("created_at", w.end.toISOString());
  if (sErr) throw new Error(`scripts read failed: ${sErr.message}`);

  const count = countScriptsInWindow((scriptRows ?? []) as HealthScriptRow[], w);

  const health = clientHealth({
    checkin: latest,
    scriptsThisWeek: count,
    now,
  });

  const actual = health.metrics.map((m) => m.rag) as Rag[];
  const ok = actual.every((r, i) => r === f.expect[i]);

  console.log(`\n${ok ? "✓" : "✗"} ${f.name}`);
  health.metrics.forEach((m, i) => {
    const good = m.rag === f.expect[i];
    console.log(
      `    ${good ? " " : "!"} ${m.label.padEnd(15)} ${String(m.value).padEnd(8)} ${m.rag.padEnd(8)}` +
        `${good ? "" : `  EXPECTED ${f.expect[i]}`}   (${m.target})`
    );
  });
  console.log(`      followers gained ${health.followersGained} (tracking only, no colour)`);
  console.log(
    `      window ${w.start.toISOString().slice(0, 10)} → ${w.end.toISOString().slice(0, 10)} (all four metrics)`
  );

  // scripts count must come from the DB read, not the fixture's intent
  if (count !== f.scriptsThisWeek) {
    console.log(`    ! scripts read back ${count}, seeded ${f.scriptsThisWeek}`);
    return false;
  }
  return ok;
}

// ── dispatch ──
const args = new Set(process.argv.slice(2));
const now = new Date();

try {
  if (args.has("--teardown")) {
    console.log("MODE: --teardown\n");
    await teardown();
    console.log("\nAll E2E health fixtures removed ✓");
  } else {
    console.log("MODE: seed → assert → teardown\n");
    await teardown({ quiet: true }); // clean slate

    const seeded: { f: Fixture; id: string }[] = [];
    try {
      for (const f of FIXTURES) {
        seeded.push({ f, id: await seed(f, now) });
        console.log(`seeded ${f.email}`);
      }

      let allOk = true;
      for (const { f, id } of seeded) {
        if (!(await verify(f, id, now))) allOk = false;
      }

      console.log(
        `\n${allOk ? "✓ All bands correct — client and admin read the same helper." : "✗ At least one band was wrong."}`
      );
      if (!allOk) process.exitCode = 1;
    } finally {
      if (args.has("--keep")) {
        console.log("\n--keep: fixtures left in place. Remove with --teardown.");
      } else {
        console.log("\nTearing down…");
        await teardown();
        console.log("Teardown complete ✓");
      }
    }
  }
} catch (err) {
  console.error("\nFATAL:", (err as Error).message);
  console.error("Attempting teardown to avoid orphans…");
  try { await teardown({ quiet: true }); console.error("Teardown complete."); }
  catch (e) { console.error("TEARDOWN FAILED:", (e as Error).message); }
  process.exit(1);
}
