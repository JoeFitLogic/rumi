// ─────────────────────────────────────────────────────────────────────────
// E2E Script-Studio harness — sanctioned, per docs/production-db-guidelines.md
//
//   node scripts/e2e-script-studio.mjs                  # --live (default): real Anthropic $$
//   node scripts/e2e-script-studio.mjs --type=broll_text # any content_type (default talking_head)
//   node scripts/e2e-script-studio.mjs --teardown        # remove all E2E rows (idempotent)
//
// WHAT IT PROVES
//   The Session-6 two-pass Script Studio path: brief → 10 hooks → pick one →
//   script written to that hook → save → status-change → delete, against a
//   disposable @rumi.test client that HAS a voice_transcript (so the voice-sample
//   branch of the context builder is exercised). It replicates the server actions'
//   substance (same shipped HOOK_GENERATOR + SCRIPT_GENERATOR prompts read from
//   src/lib/prompts, same context+voice block, same insert shape) because the
//   actions themselves are a "use server" module (next/cache) that can't be
//   imported into plain node.
//   Assertions: 10 parseable hooks, no em dash / global banned word in any hook,
//   the chosen hook's angle survives into the script, no bracketed production
//   markers for any content type, and hook_type/audience_stage saved NULL now
//   that both selectors are gone from the form.
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

// ── the SHIPPED SCRIPT_GENERATOR prompt, read out of the TS module the app
// imports. Not reference/prompts/script-generator.md — that file is the record of
// the original n8n wording and the shipped prompt has since diverged from it. ──
function loadSystemPrompt() {
  const raw = readFileSync(new URL("../src/lib/prompts/script-generator.ts", import.meta.url), "utf8");
  const m = raw.match(/export const SCRIPT_GENERATOR = ("(?:[^"\\]|\\.)*");/s);
  if (!m) throw new Error("could not read SCRIPT_GENERATOR out of the prompt module");
  return JSON.parse(m[1]);
}

// HOOK_GENERATOR is a plain template literal (hand-written, not ported), so it is
// read between its backticks rather than JSON-parsed.
function loadHookPrompt() {
  const raw = readFileSync(new URL("../src/lib/prompts/hook-generator.ts", import.meta.url), "utf8");
  const m = raw.match(/export const HOOK_GENERATOR = `([\s\S]*?)`;/);
  if (!m) throw new Error("could not read HOOK_GENERATOR out of the prompt module");
  return m[1];
}

// Mirrors parseHooks() in src/lib/prompts/hook-generator.ts. Kept in step with it.
function parseHooks(raw, max) {
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^[-*•]?\s*\d{1,2}\s*[.)\-:]\s*(.+)$/);
    const text = (m ? m[1] : "").trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
    if (text.length < 3) continue;
    if (!out.includes(text)) out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

const HOOK_COUNT = 10;
const BANNED_WORDS = [
  "chaos", "intention", "quietly", "pivotal", "robust", "delve", "tapestry", "harness",
  "underscore", "at its core", "nuanced", "unleash", "foster", "dive in", "game-changer",
  "groundbreaking", "revolutionary", "seamlessly", "leverage", "synergy", "optimise",
  "utilise", "deliverables", "landscape", "elevate", "crucial",
];

// Content type under test. Default talking_head; override with --type=broll_text
// etc. Descriptions match src/lib/scripts.ts CONTENT_TYPES, which is what the
// action puts in the brief. screen_record and clone were dropped in Session 6 and
// are deliberately absent, so --type=clone now fails loudly instead of testing a
// format the client can no longer choose.
const TYPE_DESCRIPTIONS = {
  talking_head: "Just you, speaking straight to camera. No frills.",
  storytelling: "A personal story told to camera, with a beginning, middle and turn.",
  carousel: "Swipeable slides of text. Silent, made to be read not spoken.",
  broll_text: "Voiceover over background footage.",
};

async function runLive(contentType) {
  console.log("MODE: --live (REAL script generation — Anthropic tokens will be spent)");
  console.log(`content type: ${contentType}\n`);
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

  const TOPIC = "Why posting more often is not why coaches stay broke, it's the offer.";
  const PILLAR = "connect";
  const PILLAR_LABEL = "Connect";
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  // Shared brief block — identical shape to briefBlock() in the server action.
  const briefBlock = [
    `- Content type: ${contentType} (${TYPE_DESCRIPTIONS[contentType]})`,
    `- Content pillar: ${PILLAR_LABEL}`,
    "",
    "Topic / brief from the client:",
    TOPIC,
  ];

  // ── PASS 1: ten hooks ──
  console.log(`Calling ${MODEL} for ${HOOK_COUNT} hooks…`);
  const hookBrief = [
    `Now write ${HOOK_COUNT} hooks for this brief. Output only the ${HOOK_COUNT} numbered lines.`,
    "",
    ...briefBlock,
  ].join("\n");
  const hookMsg = await anthropic.messages.create({
    model: MODEL, max_tokens: 900, system: loadHookPrompt(),
    messages: [{ role: "user", content: `${context}\n\n---\n\n${hookBrief}` }],
  });
  const hookRaw = hookMsg.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  const hooks = parseHooks(hookRaw, HOOK_COUNT);

  console.log("\n─── HOOKS ───");
  hooks.forEach((h, i) => console.log(`${String(i + 1).padStart(2)}. ${h}`));

  const hookEmDash = hooks.filter((h) => h.includes("—"));
  const hookBanned = hooks.flatMap((h) =>
    BANNED_WORDS.filter((w) => new RegExp(`\\b${w.replace(/[-]/g, "\\-")}\\b`, "i").test(h)).map((w) => `${w} → "${h}"`)
  );
  const hookMultiline = hooks.filter((h) => h.includes("\n"));

  // The client picks one. Pick deterministically (the first, i.e. the model's
  // strongest) so re-runs are comparable.
  const chosenHook = hooks[0] ?? "";
  console.log(`\nchosen hook: ${chosenHook}`);

  // ── PASS 2: the script, written to that hook ──
  const brief = [
    "Now write ONE script with these parameters. Follow the FORMAT-SPECIFIC OUTPUT rules for the content type exactly.",
    "",
    ...briefBlock,
    "",
    "THE HOOK IS ALREADY CHOSEN. The client picked this line, so the script is written to its angle:",
    chosenHook,
    "",
    "Open on that hook. Use it as the HOOK beat close to word for word, tightening it only if it does not scan out loud. Do not swap it for a different angle, and do not write a second hook in front of it. BUILD, DELIVER and CLOSE all have to pay off the promise this line makes.",
    "",
    "- Target length: 60 seconds",
  ].join("\n");

  console.log(`\nCalling ${MODEL} for the script…`);
  const msg = await anthropic.messages.create({
    model: MODEL, max_tokens: 2500, system: loadSystemPrompt(),
    messages: [{ role: "user", content: `${context}\n\n---\n\n${brief}` }],
  });
  const script = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  if (!script) throw new Error("empty script returned");

  // Save exactly as the action does: hook_type / audience_stage are NULL now
  // that neither selector exists in the form.
  const { data: saved, error: insErr } = await admin.from("scripts").insert({
    user_id: userId, topic: TOPIC,
    content_type: contentType, hook_type: null, pillar: PILLAR,
    audience_stage: null, length: "60 seconds", additional_context: null,
    generated_script: script, status: "drafted",
  }).select("id, status, content_type, pillar, hook_type, audience_stage, generated_script").single();
  if (insErr) throw new Error(`save failed: ${insErr.message}`);

  // Library read (owner-filtered) + status change + delete.
  const { data: lib } = await admin.from("scripts").select("id, topic, status")
    .eq("user_id", userId).order("created_at", { ascending: false });
  await admin.from("scripts").update({ status: "filmed" }).eq("id", saved.id).eq("user_id", userId);
  const { data: afterStatus } = await admin.from("scripts").select("status").eq("id", saved.id).single();
  const { data: del } = await admin.from("scripts").delete().eq("id", saved.id).eq("user_id", userId).select("id");

  console.log("\n─── RESULTS ───");
  console.log("hooks parsed         :", hooks.length, `(expect ${HOOK_COUNT})`);
  console.log("hooks w/ em dash     :", hookEmDash.length === 0 ? "none ✓" : `FOUND → ${hookEmDash.join(" | ")}`);
  console.log("hooks w/ banned word :", hookBanned.length === 0 ? "none ✓" : `FOUND → ${hookBanned.join(" | ")}`);
  console.log("hooks on one line    :", hookMultiline.length === 0 ? "yes ✓" : "FOUND multi-line hook");
  console.log("saved status         :", saved.status, "(expect drafted)");
  console.log("content_type saved   :", saved.content_type);
  console.log("pillar saved         :", saved.pillar, "(expect connect)");
  console.log("hook_type saved      :", saved.hook_type, "(expect null)");
  console.log("audience_stage saved :", saved.audience_stage, "(expect null)");
  console.log("library rows for user:", lib.length, "(expect 1)");
  console.log("status after change  :", afterStatus.status, "(expect filmed)");
  console.log("delete removed rows  :", del.length, "(expect 1)");
  const voiceEcho = /head in|dead simple|lovely lass|does my head|not one|the offer|not the volume/i.test(script);
  console.log("voice/topic in script:", voiceEcho ? "yes ✓" : "check manually");

  // The whole point of the flow change: the script has to OPEN on the hook the
  // client chose. Compare the distinctive words of the hook against the first
  // ~350 chars of the script (HOOK beat) rather than demanding a literal match,
  // because the prompt allows tightening the line so it scans out loud.
  const hookWords = chosenHook.toLowerCase().match(/[a-z']{5,}/g) ?? [];
  const opening = script.slice(0, 350).toLowerCase();
  const overlap = hookWords.filter((w) => opening.includes(w));
  const hookHonoured = hookWords.length === 0 || overlap.length / hookWords.length >= 0.5;
  console.log(
    "script opens on hook :",
    hookHonoured ? `yes ✓ (${overlap.length}/${hookWords.length} key words)` : `NO (${overlap.length}/${hookWords.length})`
  );

  // No bracketed production markers, any format. HOOK/BUILD/DELIVER/CLOSE with
  // the words underneath, nothing else.
  const brackets = script.match(/\[[^\]\n]*\]/g) ?? [];
  const noBrackets = brackets.length === 0;
  console.log("bracketed markers    :", noBrackets ? "none ✓" : `FOUND ${brackets.length} → ${brackets.slice(0, 5).join(" | ")}`);

  console.log("\n─── FULL SCRIPT ───\n");
  console.log(script);

  console.log("\nTearing down…");
  await teardown();
  const gone = await findAuthUser(E2E_EMAIL);
  console.log("auth user after teardown:", gone ? "STILL EXISTS (!!)" : "gone ✓");

  const ok =
    hooks.length === HOOK_COUNT && hookEmDash.length === 0 && hookBanned.length === 0 &&
    hookMultiline.length === 0 && hookHonoured &&
    saved.status === "drafted" && saved.pillar === "connect" &&
    saved.hook_type === null && saved.audience_stage === null &&
    afterStatus.status === "filmed" && del.length === 1 && lib.length === 1 && !gone && noBrackets;
  console.log(ok ? "\n✓ PASS — hooks/pick/script/save/status/delete all verified, no rows left." : "\n✗ FAIL — see mismatches above.");
  if (!ok) process.exitCode = 1;
}

const argv = process.argv.slice(2);
const args = new Set(argv);
const typeArg = (argv.find((a) => a.startsWith("--type=")) ?? "").split("=")[1] || "talking_head";
try {
  if (args.has("--teardown")) { console.log("MODE: --teardown\n"); await teardown(); }
  else {
    if (!TYPE_DESCRIPTIONS[typeArg]) {
      throw new Error(`unknown --type=${typeArg} (expected one of ${Object.keys(TYPE_DESCRIPTIONS).join(", ")})`);
    }
    await runLive(typeArg);
  }
} catch (err) {
  console.error("\nFATAL:", err.message);
  await teardown({ quiet: true }).catch(() => {});
  process.exit(1);
}
