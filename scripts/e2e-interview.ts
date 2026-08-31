// ─────────────────────────────────────────────────────────────────────────
// E2E INTERVIEW harness — sanctioned, per docs/production-db-guidelines.md
//
//   node --experimental-strip-types --import ./scripts/_alias-register.mjs \
//        scripts/e2e-interview.ts                 # full run (costs model calls)
//   ...                                            scripts/e2e-interview.ts --teardown
//
// WHAT IT PROVES: Script Studio's Interview mode, end to end. A disposable
// client is seeded WITH voice data (catchphrases, swearing level, banned words),
// then a scripted interview is driven through the same model call, system blocks
// and parsing the shipped interviewTurn uses:
//
//   1. Rumi opens by asking which story type, and writes no script.
//   2. One question at a time.
//   3. A deliberately thin answer ("it went really well") makes it DRILL rather
//      than move on — the whole point of the mode.
//   4. It refuses to write until the extraction is genuinely done.
//   5. The finished script comes back inside the ===SCRIPT=== markers, in the
//      client's voice, with an irreplicable detail, no banned words, no bracketed
//      production markers, and NO em dashes.
//   6. It saves as a normal `scripts` row (storytelling / connect / drafted).
//   7. The spec is served from prompt cache, not re-billed every turn.
//
// The em-dash assertion earns its place: the first run of this harness produced
// a script with two of them in it, which is what put stripPunctuationDashes in
// src/lib/interview.ts. The prompt rule alone is not enough.
//
// NOT COVERED: the server action's own getActiveClient authorization, which
// needs a request session this cannot build headlessly.
//
// SAFETY: disposable e2e-interview@rumi.test only; teardown removes its scripts,
// onboarding row, profile and auth user, and runs automatically if the seed
// half-fails. Touches no shared data.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync } from "fs";
import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";

const env: Record<string, string> = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) { env[m[1]] = m[2].trim(); process.env[m[1]] = m[2].trim(); }
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { buildVoiceContext } = await import("@/lib/scriptContext");
const { STORY_EXTRACTOR } = await import("@/lib/prompts/story-extractor");
const { extractScript, replyWithoutScript, extractImf, deriveTopic, detectStoryType } =
  await import("@/lib/interview");
type Msg = { role: "user" | "assistant"; content: string };

const EMAIL = "e2e-interview@rumi.test";
const NAME = "E2E Interview";
const BANNED = ["journey", "hustle", "grind", "queen"];

const ONBOARDING = {
  ideal_client: "Online strength coach, 25-40, 1-2k followers, stuck under 5k/mo.",
  client_struggles: "Inconsistent posting, no clear offer, leads that never convert.",
  client_2am_thoughts: "\"I'm working every hour and still not making money.\"",
  products_services: "1:1 coaching (£300/mo), 12-week transformation (£1200)",
  how_you_talk: "Blunt, Scottish, swears when it matters. Short sentences. No fluff.",
  swearing_level: "Moderate",
  catchphrases: "does my head in; dead simple; here's the thing; nae bother",
  words_never_say: BANNED.join(", "),
  creators_that_cringe: "Anyone shouting at a camera in a rented Lambo.",
  contrarian_beliefs: "Posting more is not the fix. Nobody knows what you sell.",
  voice_transcript:
    "Right, here's the thing that does my head in. Everyone tells you to post more. I had a client last week, posting twice a day for months, not a single call booked. It wasn't the posting. Nobody knew what she actually sold. Fixed the offer, dead simple, one thing one price, three calls that week.",
  anything_else: "[E2E FIXTURE] Disposable test record — safe to delete.",
};

async function findUser(email: string) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data.users.find((u) => u.email === email) ?? null;
}
async function teardown() {
  const u = await findUser(EMAIL);
  if (!u) return;
  if (!(u.email ?? "").endsWith("@rumi.test")) throw new Error("refusing to touch a real account");
  for (const [t, c] of [["scripts", "user_id"], ["onboarding_responses", "user_id"], ["profiles", "id"]] as const) {
    await admin.from(t).delete().eq(c, u.id);
  }
  await admin.auth.admin.deleteUser(u.id);
}

if (process.argv.includes("--teardown")) {
  await teardown();
  console.log("torn down.");
  process.exit(0);
}

const R: Record<string, boolean> = {};
await teardown();
let clientId = "";
try {
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL, password: randomBytes(32).toString("base64url"),
    email_confirm: true, user_metadata: { name: NAME },
  });
  if (error) throw new Error(error.message);
  clientId = data.user.id;
  await admin.from("profiles").insert({
    id: clientId, email: EMAIL, name: NAME, role: "client",
    account_status: "active", onboarding_complete: true,
  });
  await admin.from("onboarding_responses").insert({ user_id: clientId, status: "submitted", ...ONBOARDING });
  console.log(`client ${clientId}\n`);

  // The shipped action authorizes via getActiveClient, which needs a request
  // session we don't have headlessly. Drive the same model call the action makes,
  // with the same system blocks, the same caching and the same parsing.
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const voice = await buildVoiceContext(admin as never, clientId);
  console.log(`voice context: ${voice.length} chars · spec: ${STORY_EXTRACTOR.length} chars\n`);

  let cacheReads = 0;
  async function turn(thread: Msg[]): Promise<string> {
    const needsOpener = thread.length === 0 || thread[0].role === "assistant";
    const messages = needsOpener
      ? [{ role: "user" as const, content: "Start the interview. Ask me which story type I'm working on, and nothing else yet." }, ...thread]
      : thread;
    const msg = await anthropic.messages.create({
      model: process.env.SCRIPT_MODEL ?? "claude-sonnet-4-6",
      max_tokens: 2000,
      system: [
        { type: "text", text: STORY_EXTRACTOR, cache_control: { type: "ephemeral" } },
        { type: "text", text: voice, cache_control: { type: "ephemeral" } },
      ],
      messages,
    });
    cacheReads += msg.usage.cache_read_input_tokens ?? 0;
    return msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim();
  }

  const thread: Msg[] = [];
  const say = async (text: string, label: string) => {
    thread.push({ role: "user", content: text });
    const reply = await turn(thread);
    thread.push({ role: "assistant", content: reply });
    console.log(`── ${label}\n   YOU: ${text.slice(0, 90)}${text.length > 90 ? "…" : ""}`);
    console.log(`   RUMI: ${replyWithoutScript(reply).replace(/\s+/g, " ").slice(0, 260)}\n`);
    return reply;
  };

  // 1) Opening — Rumi asks the type, one question, no script.
  const open = await turn([]);
  thread.push({ role: "assistant", content: open });
  console.log(`── opening\n   RUMI: ${open.replace(/\s+/g, " ").slice(0, 260)}\n`);
  R.opensWithTypeQuestion = /story type|which of|type are you/i.test(open) && !extractScript(open).script;

  // 2) Pick a type → first extraction question, ONE question.
  const q1 = await say("I want to do 01 THE WIN.", "pick a type");
  const qMarks = (q1.match(/\?/g) ?? []).length;
  R.oneQuestionAtATime = qMarks <= 2 && !extractScript(q1).script;

  // 3) A deliberately lazy, generic answer — it must drill, not move on.
  const lazy = await say("It went really well and I was happy about it.", "lazy answer (must drill)");
  R.drillsOnThinAnswer = !extractScript(lazy).script && /\?/.test(lazy);

  // 4) A real scene with an irreplicable detail.
  await say(
    "I was in the car outside Tesco in Livingston, half four on a Tuesday, phone on the dash. " +
    "Email came in saying the 12-week programme had sold out. Twelve spots. I'd only ever filled four before. " +
    "I actually said 'no chance' out loud to an empty car. Hands went proper shaky.",
    "real scene + detail"
  );
  await say(
    "Felt sick, honestly, not happy. Like I'd been caught out. I'd spent two years telling myself I was rubbish at selling.",
    "the feeling, tied to the moment"
  );
  const near = await say(
    "What I did differently: I stopped posting workouts and started posting the thing that does my head in, " +
    "which is coaches selling programmes nobody understands. One offer, one price, said it plainly for six weeks straight.",
    "what changed"
  );

  // 5) Push to the end.
  let reply = near;
  for (let i = 0; i < 5 && !extractScript(reply).script; i++) {
    reply = await say(
      i === 0
        ? "Before it I believed I was just not a salesperson, that some people have it and I don't. It means I can stop apologising for charging."
        : "That's everything I've got. Lock the IMF and write the script.",
      `push to script ${i + 1}`
    );
  }

  const { script, markersMissing } = extractScript(reply);
  R.wroteScript = !!script;
  R.markersClean = !!script && !markersMissing;
  console.log("── FINISHED SCRIPT ──\n" + (script ?? "(none)") + "\n");

  if (script) {
    const words = script.split(/\s+/).filter(Boolean).length;
    const banned = BANNED.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(script));
    const emdash = (script.match(/—/g) ?? []).length;
    const endash = (script.match(/–/g) ?? []).length;
    const brackets = /\[(ON SCREEN|B-ROLL|SCREEN|PAUSE|CLONE)/i.test(script);
    const detail = /livingston|tesco|twelve|12 spots|no chance|half four/i.test(script);
    R.noBannedWords = banned.length === 0;
    R.noEmDashes = emdash === 0 && endash === 0;
    R.noBracketMarkers = !brackets;
    R.hasIrreplicableDetail = detail;
    R.lengthInRange = words >= 150 && words <= 400;
    console.log(`words=${words} · banned=${JSON.stringify(banned)} · em=${emdash} en=${endash} · brackets=${brackets} · detail=${detail}`);
    console.log(`IMF: ${extractImf(reply).replace(/\s+/g, " ").slice(0, 200)}`);
    console.log(`topic: ${deriveTopic(reply, script)}`);
    console.log(`storyType: ${detectStoryType(thread)}`);
    R.derivedTopic = deriveTopic(reply, script).length > 0;
    R.derivedStoryType = detectStoryType(thread) === "01 THE WIN";

    // The save path, exactly as saveInterviewScript writes it.
    const { data: row, error: insErr } = await admin.from("scripts").insert({
      user_id: clientId, topic: deriveTopic(reply, script).slice(0, 300),
      content_type: "storytelling", hook_type: null, pillar: "connect", audience_stage: null,
      length: "60s", additional_context: `Interview · ${detectStoryType(thread)}\n\n${extractImf(reply)}`,
      generated_script: script, status: "drafted",
    }).select("id, user_id, content_type, pillar, status").single();
    R.saved = !insErr && row?.user_id === clientId && row?.content_type === "storytelling";
    console.log(`saved row: ${insErr ? insErr.message : JSON.stringify(row)}`);
  }

  R.promptCached = cacheReads > 0;
  console.log(`\ncache_read_input_tokens across the interview: ${cacheReads}`);
} catch (e) {
  console.error("\nFATAL:", (e as Error).message);
  await teardown().catch(() => {});
  process.exit(1);
}

console.log("\nTearing down…");
await teardown();
console.log(`user left: ${(await findUser(EMAIL)) ? "YES" : "none"}`);
console.log("\n─── VERDICT ───");
for (const [k, v] of Object.entries(R)) console.log(`${k.padEnd(24)}: ${v ? "PASS" : "FAIL"}`);
console.log(Object.values(R).every(Boolean) ? "\nALL PASS" : "\nFAILURES PRESENT");
