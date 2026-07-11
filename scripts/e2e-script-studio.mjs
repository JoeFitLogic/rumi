// ─────────────────────────────────────────────────────────────────────────
// E2E Script-Studio harness — sanctioned, per docs/production-db-guidelines.md
//
//   node scripts/e2e-script-studio.mjs           # --live (default): real Anthropic $$
//   node scripts/e2e-script-studio.mjs --teardown # remove all E2E rows (idempotent)
//
// WHAT IT PROVES
//   The Script Studio generate → save → status-change → delete path, against a
//   disposable @rumi.test client that HAS a voice_transcript (so the voice-sample
//   branch of the context builder is exercised). It replicates the server action's
//   substance (same verbatim SCRIPT_GENERATOR prompt read from reference/prompts,
//   same context+voice block, same insert shape) because the action itself is a
//   "use server" module (next/cache) that can't be imported into plain node.
//
// SAFETY (mirrors scripts/e2e-strategy.mjs)
//   • Fixed disposable identity e2e-script-studio@rumi.test — the stable key.
//   • Every write/delete guarded: email MUST equal the identity AND end @rumi.test
//     AND id MUST NOT be in PROTECTED; any mismatch aborts before touching a row.
//   • Teardown is idempotent, runs first for a clean slate and again on any seed
//     failure, so a half-run can't leave orphans. No invite email is sent.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync } from "fs";
import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// ── env (.env.local is CRLF; trim strips stray \r) ──
const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) { env[m[1]] = m[2].trim(); process.env[m[1]] = m[2].trim(); }
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const MODEL = env.SCRIPT_MODEL ?? "claude-sonnet-4-6";

// ── fixed disposable identity ──
const E2E_EMAIL = "e2e-script-studio@rumi.test";
const E2E_NAME = "E2E Script Studio";

const PROTECTED_IDS = new Set([
  "e19354ba-0988-4721-8fe2-d4ae983d8b9f", // joe@fitlogicsystems.co.uk
  "c151a827-dd34-45d4-a887-89e291eaaa6a", // info@contentcoachhq.com
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
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
  for (const [tbl, col] of [["scripts", "user_id"], ["onboarding_responses", "user_id"], ["profiles", "id"]]) {
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

// Onboarding WITH a voice_transcript, so the voice-sample branch is exercised.
const ONBOARDING = {
  describe_yourself_3_words: "Direct, practical, warm",
  what_makes_you_different: "Systems-first coaching backed by real data, not vibes.",
  one_sentence_description: "I help busy strength coaches turn content into booked calls.",
  ideal_client: "Online strength coach, 25-40, 1-2k followers, stuck under 5k/mo.",
  client_struggles: "Inconsistent posting, no clear offer, leads that never convert.",
  client_misconceptions: "That posting more often is the fix. It's the offer, not the volume.",
  top_three_goals: "Hit 10k/mo, build an email list, post 5x/week without burning out.",
  platforms: "Instagram (primary), YouTube (growth)",
  products_services: "1:1 coaching (£300/mo), 12-week transformation (£1200)",
  biggest_challenge: "Turning followers into paying clients.",
  voice_transcript:
    "Right, so here's the thing that does my head in. Everyone tells you to post more. Post every day, they say. But I had a client last week, lovely lass, posting twice a day for months, and she'd not booked a single call. Not one. And it wasn't the posting. It was that nobody knew what she actually sold. So we fixed the offer first, dead simple, one thing, one price, and she booked three calls that same week. Sometimes it's not about doing more. It's about being clear.",
  anything_else: "[E2E FIXTURE] Disposable test record — safe to delete.",
};

// ── verbatim SCRIPT_GENERATOR prompt, same slice the build uses ──
function loadSystemPrompt() {
  const raw = readFileSync(new URL("../reference/prompts/script-generator.md", import.meta.url), "utf8");
  const lines = raw.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].startsWith("#")) i++;
  while (i < lines.length && lines[i].trim() === "") i++;
  return lines.slice(i).join("\n").replace(/\s+$/, "") + "\n";
}

async function runLive() {
  console.log("MODE: --live (REAL script generation — Anthropic tokens will be spent)\n");
  await teardown({ quiet: true });
  let userId;
  try {
    userId = await ensureAccount();
    const { error } = await admin.from("onboarding_responses")
      .insert({ user_id: userId, status: "submitted", ...ONBOARDING });
    if (error) throw new Error(`onboarding insert failed: ${error.message}`);
  } catch (err) {
    console.error("seed failed — auto-tearing-down:", err.message);
    await teardown({ quiet: true });
    throw err;
  }

  // Build the context block INCLUDING the voice sample (same shape as the action).
  const { data: onb } = await admin.from("onboarding_responses")
    .select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const ctxParts = ["Here is everything we know about this client. Write the script in THEIR voice, from these answers up.", ""];
  for (const [k, v] of Object.entries(ONBOARDING)) {
    if (k === "voice_transcript" || !v) continue;
    ctxParts.push(`${k}:`, String(v), "");
  }
  ctxParts.push("## VOICE SAMPLE (match this exact speaking voice, rhythm and word choice)", onb.voice_transcript, "");
  const context = ctxParts.join("\n").trim();

  const brief = [
    "Now write ONE script with these parameters. Follow the FORMAT-SPECIFIC OUTPUT rules for the content type exactly.",
    "",
    "- Content type: talking_head (Just you, speaking straight to camera. No frills.)",
    "- Hook type: Contrarian take",
    "- Content pillar: Perspective",
    "- Audience stage: Discovery",
    "- Target length: 60 seconds",
    "",
    "Topic / brief from the client:",
    "Why posting more often is not why coaches stay broke — it's the offer.",
  ].join("\n");

  console.log(`Calling ${MODEL}…`);
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: MODEL, max_tokens: 2500, system: loadSystemPrompt(),
    messages: [{ role: "user", content: `${context}\n\n---\n\n${brief}` }],
  });
  const script = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  if (!script) throw new Error("empty script returned");

  // Save exactly as the action does.
  const { data: saved, error: insErr } = await admin.from("scripts").insert({
    user_id: userId, topic: "Why posting more often is not why coaches stay broke — it's the offer.",
    content_type: "talking_head", hook_type: "contrarian", pillar: "perspective",
    audience_stage: "discovery", length: "60 seconds", additional_context: null,
    generated_script: script, status: "drafted",
  }).select("id, status, content_type, generated_script").single();
  if (insErr) throw new Error(`save failed: ${insErr.message}`);

  // Library read (owner-filtered) + status change + delete.
  const { data: lib } = await admin.from("scripts").select("id, topic, status")
    .eq("user_id", userId).order("created_at", { ascending: false });
  await admin.from("scripts").update({ status: "filmed" }).eq("id", saved.id).eq("user_id", userId);
  const { data: afterStatus } = await admin.from("scripts").select("status").eq("id", saved.id).single();
  const { data: del } = await admin.from("scripts").delete().eq("id", saved.id).eq("user_id", userId).select("id");

  console.log("\n─── RESULTS ───");
  console.log("saved status         :", saved.status, "(expect drafted)");
  console.log("content_type saved   :", saved.content_type);
  console.log("library rows for user:", lib.length, "(expect 1)");
  console.log("status after change  :", afterStatus.status, "(expect filmed)");
  console.log("delete removed rows  :", del.length, "(expect 1)");
  const voiceEcho = /head in|dead simple|lovely lass|does my head|not one|it's the offer|not the volume/i.test(script);
  console.log("voice/topic in script:", voiceEcho ? "yes ✓" : "check manually");
  console.log("\n─── SCRIPT PREVIEW (first 900 chars) ───\n");
  console.log(script.slice(0, 900));

  console.log("\nTearing down…");
  await teardown();
  const gone = await findAuthUser(E2E_EMAIL);
  console.log("auth user after teardown:", gone ? "STILL EXISTS (!!)" : "gone ✓");

  const ok = saved.status === "drafted" && afterStatus.status === "filmed" && del.length === 1 && lib.length === 1 && !gone;
  console.log(ok ? "\n✓ PASS — generate/save/status/delete all verified, no rows left." : "\n✗ FAIL — see mismatches above.");
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
