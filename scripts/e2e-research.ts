// ─────────────────────────────────────────────────────────────────────────
// E2E Research harness — sanctioned, per docs/production-db-guidelines.md
//
//   node --experimental-strip-types --import ./scripts/_research-register.mjs \
//        scripts/e2e-research.ts            # --live (default): real Anthropic + ONE Apify run ($$)
//   node --experimental-strip-types --import ./scripts/_research-register.mjs \
//        scripts/e2e-research.ts --selftest # imports + static subreddit-shape proof, NO API calls
//   ...                                     scripts/e2e-research.ts --teardown  # remove all E2E rows
//
// WHAT IT PROVES (against a disposable e2e-research@rumi.test client)
//   Gate A — Transcript analyser (Step 2): real TRANSCRIPT_ANALYZER_SYSTEM prompt → cards.
//   Gate B — Ideation (Step 4): real ideationSystem/ideationUser → parse → write to the
//            Cleo-shared content_ideas table via SERVICE ROLE + explicit client_id owner,
//            read back OWNER-FILTERED, then delete. Same insert shape as saveIdeas().
//   Gate C — Reddit subreddit bug: calls the REAL buildRedditInput() from apify.ts and does
//            ONE minimal Apify run, proving posts come back FROM THE TARGETED SUBREDDIT
//            (startUrls community targeting), not a keyword-only search.
//
//   Every prompt/parse/apify function is IMPORTED FROM src/ — no replication, no drift.
//   server-only is aliased to an empty module by scripts/_research-register.mjs.
//
// SAFETY (mirrors scripts/e2e-script-studio.mjs)
//   • Fixed disposable identity e2e-research@rumi.test — the stable key.
//   • Every write/delete guarded: email MUST equal the identity AND end @rumi.test
//     AND id MUST NOT be in PROTECTED (Joe, CTC, Priya 1111…, Marcus 2222…).
//   • Teardown idempotent; runs first for a clean slate and again on any seed failure.
//   • NEVER writes to the Priya/Marcus demo seeds. No invite email is sent.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync } from "fs";
import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// ── REAL shipped code under test (zero replication) ──
import {
  TRANSCRIPT_ANALYZER_SYSTEM,
  transcriptAnalyzerUser,
} from "../src/lib/prompts/transcript-analyzer.ts";
import {
  ideationSystem,
  ideationUser,
} from "../src/lib/prompts/ideation-synthesis.ts";
import { parseJsonArrayLoose } from "../src/lib/research/parse.ts";
import {
  buildRedditInput,
  startRedditRun,
  getRedditRun,
  getDatasetItems,
  TERMINAL_STATUSES,
} from "../src/lib/research/apify.ts";

// ── env (.env.local is CRLF; trim strips stray \r) ──
const env: Record<string, string> = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) { env[m[1]] = m[2].trim(); process.env[m[1]] = m[2].trim(); }
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const MODEL = env.RESEARCH_MODEL ?? "claude-sonnet-4-6";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── fixed disposable identity ──
const E2E_EMAIL = "e2e-research@rumi.test";
const E2E_NAME = "E2E Research";

const PROTECTED_IDS = new Set([
  "e19354ba-0988-4721-8fe2-d4ae983d8b9f", // joe@fitlogicsystems.co.uk
  "c151a827-dd34-45d4-a887-89e291eaaa6a", // info@contentcoachhq.com
  "11111111-1111-4111-8111-111111111111", // Priya demo seed — never touch
  "22222222-2222-4222-8222-222222222222", // Marcus demo seed — never touch
]);

function assertSafeTarget(userId: string, email: string) {
  const e = (email || "").toLowerCase();
  if (e !== E2E_EMAIL) throw new Error(`refusing to act on ${email} — not the E2E identity`);
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

async function teardown({ quiet = false }: { quiet?: boolean } = {}) {
  const user = await findAuthUser(E2E_EMAIL);
  const prof = await admin.from("profiles").select("id,email").eq("email", E2E_EMAIL).maybeSingle();
  const userId = user?.id ?? prof.data?.id ?? null;
  if (!userId) { if (!quiet) console.log(`teardown: nothing to remove (no ${E2E_EMAIL}).`); return; }
  assertSafeTarget(userId, user?.email ?? prof.data?.email ?? E2E_EMAIL);
  if (!quiet) console.log(`teardown target: ${userId}  (${E2E_EMAIL})`);
  // content_ideas owner column is client_id; the rest are user_id / id.
  for (const [tbl, col] of [
    ["content_ideas", "client_id"],
    ["onboarding_responses", "user_id"],
    ["profiles", "id"],
  ] as const) {
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
  assertSafeTarget(user.id, user.email ?? "");
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

// Onboarding seeded with EXACTLY the CONTEXT_FIELDS buildIdeationContext() reads,
// plus a voice_transcript (the user asked for one present).
const ONBOARDING = {
  status: "submitted",
  ideal_client: "Women 30-45 who have been chronic dieters for years and feel controlled by calorie tracking and diet rules.",
  client_types: "Chronic dieters, ex-Weight-Watchers, all-or-nothing eaters.",
  client_struggles: "Calorie obsession, night bingeing after being 'good' all day, food guilt around family meals, feeling like a failure.",
  client_misconceptions: "That more willpower is the fix; that stopping tracking means instant weight gain.",
  client_objections: "I've tried everything and nothing works; I'm broken; it's different for me.",
  content_performed_well: "Reels calling out diet-culture lies — the 'you're not broken, the diet is' angle.",
  voice_transcript:
    "Here's what nobody tells you about calorie counting. It's not that you lack willpower. You've got loads of willpower — you've been white-knuckling it for years. The problem is the whole system teaches you to distrust your own body. So let's stop doing maths at the dinner table and start rebuilding some trust.",
  anything_else: "[E2E FIXTURE] Disposable test record — safe to delete.",
};

// A call transcript: coach + PROSPECT. The analyser must pull only the prospect's words.
const TRANSCRIPT = `Coach: So tell me — what made you book this call today?
Prospect: Honestly? I'm exhausted. I've been tracking every single calorie for about three years and I still feel like I'm failing. Every time I sit down to eat with my family I've got the app open under the table and I feel like a total freak.
Coach: That sounds really draining.
Prospect: It is. And the worst part is I've tried everything — Weight Watchers, keto, the Noom thing — and nothing sticks. I always end up bingeing at night because I've been so 'good' all day. I just feel like I'm broken, like there's something wrong with me that other people don't have.
Coach: You're not broken.
Prospect: I want to believe that. But every diet's told me if I just had more willpower it would work. So when it doesn't work I assume it's me. I can't imagine ever just eating a meal without doing maths in my head first.
Coach: What would it feel like to not do that?
Prospect: Terrifying, honestly. Like I'd immediately gain fifty pounds. That's the fear. I know it's probably not rational but it's there. I just want to feel normal around food again. I'm so tired of thinking about it every waking minute.`;

// ── Claude helper (mirrors actions.ts callClaude) ──
async function callClaude(system: string, user: string, maxTokens: number): Promise<string> {
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: MODEL, max_tokens: maxTokens, system,
    messages: [{ role: "user", content: user }],
  });
  const text = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text ?? "").join("").trim();
  if (!text) throw new Error("empty model response");
  return text;
}

// ── Gate C — static proof that buildReddit passes subreddits (no API) ──
function proveSubredditShape() {
  const input: any = buildRedditInput(["loseit", "r/xxfitness"]);
  const urls = (input.startUrls ?? []).map((u: any) => u.url);
  console.log("buildRedditInput(['loseit','r/xxfitness']).startUrls:");
  urls.forEach((u: string) => console.log("   →", u));
  const targetsBoth =
    urls.some((u: string) => /\/r\/loseit\//.test(u)) &&
    urls.some((u: string) => /\/r\/xxfitness\//.test(u));
  const noKeywordOnly = input.searchCommunities === false; // startUrls, not a community search
  console.log("targets BOTH picked subreddits via startUrls:", targetsBoth ? "yes ✓" : "NO ✗");
  console.log("searchCommunities=false (not keyword/community search):", noKeywordOnly ? "yes ✓" : "no");
  return targetsBoth;
}

async function runSelftest() {
  console.log("MODE: --selftest (imports + static subreddit-shape proof, NO API calls)\n");
  console.log("Imported from src/ (shipped code):");
  console.log("  TRANSCRIPT_ANALYZER_SYSTEM length:", TRANSCRIPT_ANALYZER_SYSTEM.length, "chars");
  console.log("  ideationSystem/ideationUser:", typeof ideationSystem, "/", typeof ideationUser);
  console.log("  parseJsonArrayLoose:", typeof parseJsonArrayLoose);
  console.log("  buildRedditInput / TERMINAL_STATUSES:", typeof buildRedditInput, "/", [...TERMINAL_STATUSES].join(","));
  console.log("");
  const ok = proveSubredditShape();
  console.log(ok ? "\n✓ SELFTEST PASS" : "\n✗ SELFTEST FAIL");
  if (!ok) process.exitCode = 1;
}

async function runLive() {
  console.log(`MODE: --live (REAL Anthropic tokens + ONE minimal Apify run — credits WILL be spent)\n`);
  await teardown({ quiet: true });
  let clientId: string;
  try {
    clientId = await ensureAccount();
    const { error } = await admin.from("onboarding_responses").insert({ user_id: clientId, ...ONBOARDING });
    if (error) throw new Error(`onboarding insert failed: ${error.message}`);
  } catch (err: any) {
    console.error("seed failed — auto-tearing-down:", err.message);
    await teardown({ quiet: true });
    throw err;
  }
  console.log(`seeded disposable client ${clientId} (${E2E_EMAIL}) with onboarding + voice_transcript\n`);

  const results: Record<string, boolean> = {};

  // ── GATE A — Transcript analyser (Step 2) ──
  console.log("─── GATE A: Transcript analyser (Step 2) ───");
  const rawA = await callClaude(TRANSCRIPT_ANALYZER_SYSTEM, transcriptAnalyzerUser(TRANSCRIPT), 4000);
  const cards = parseJsonArrayLoose<any>(rawA).filter((c) => c && typeof c.text === "string" && c.text.trim());
  const cats = new Set(cards.map((c) => c.category));
  const coachLeak = cards.some((c) => /every time I sit down|maths in my head|I'm broken/i.test(c.text) === false && /coach:/i.test(c.text));
  console.log(`  cards returned: ${cards.length}  categories: ${[...cats].join(", ")}`);
  cards.slice(0, 4).forEach((c) => console.log(`   • [${c.category}] "${(c.text as string).slice(0, 90)}"`));
  results.transcript = cards.length >= 5 && cats.size >= 2 && !coachLeak;
  console.log(`  GATE A: ${results.transcript ? "PASS ✓" : "FAIL ✗"}\n`);

  // ── GATE B — Ideation (Step 4) + content_ideas write (service role + owner filter) ──
  console.log("─── GATE B: Ideation (Step 4) + content_ideas write ───");
  // Build ideation context server-side from onboarding — mirror buildIdeationContext() exactly.
  const { data: onb } = await admin.from("onboarding_responses")
    .select("ideal_client,client_types,client_struggles,client_misconceptions,client_objections,content_performed_well")
    .eq("user_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const r = (onb ?? {}) as Record<string, string | null>;
  const val = (k: string) => (r[k] ?? "").toString().trim();
  const context = {
    clientName: "Alex",
    idealClient: val("ideal_client") || val("client_types"),
    painPoints: val("client_struggles"),
    recurringLanguage: val("client_misconceptions"),
    limitingBeliefs: val("client_objections") || val("client_misconceptions"),
    contentWorking: val("content_performed_well"),
  };
  // Chain Step 2 → Step 4: feed the transcript cards in as the "clients" note.
  const notes = {
    analytics: "Top reel last month: 'stop tracking calories' — 120k views, saves 3x average.",
    clients: cards.map((c) => `- (${c.category}) ${c.text}`).join("\n"),
    forums: "r/loseit thread: 'I feel like I'm shouting into the void logging food nobody sees.'",
    trends: "'Food noise' language (from Ozempic discourse) everywhere; 'cortisol face' reels trending.",
  };
  const rawB = await callClaude(ideationSystem(context), ideationUser(notes, []), 4000);
  const ideas = parseJsonArrayLoose<any>(rawB)
    .filter((i) => i && typeof i.title === "string" && i.title.trim())
    .map((i) => ({
      title: (i.title ?? "").trim(),
      hook: (i.hook ?? "").trim(),
      pillar: (i.pillar ?? "").trim(),
      format: (i.format ?? "").trim(),
      source: (i.source ?? "").trim(),
      angle: (i.angle ?? "").trim(),
    }));
  console.log(`  ideas generated: ${ideas.length}`);
  ideas.slice(0, 3).forEach((i) => console.log(`   • "${i.title}" — hook: "${i.hook.slice(0, 70)}"`));

  // Write via SERVICE ROLE + explicit client_id owner (same shape as saveIdeas()).
  const rows = ideas.slice(0, 3).map((idea) => ({
    client_id: clientId, title: idea.title, hook: idea.hook,
    pillar: idea.pillar || null, format: idea.format || null,
    source: idea.source || null, angle: idea.angle || null, status: "idea",
  }));
  const { error: insErr } = await admin.from("content_ideas").insert(rows);
  if (insErr) throw new Error(`content_ideas insert failed: ${insErr.message}`);
  // Read back OWNER-FILTERED — proves rows are retrievable by the owning client only.
  const { data: back, error: readErr } = await admin.from("content_ideas")
    .select("id,title,status,client_id").eq("client_id", clientId);
  if (readErr) throw new Error(`content_ideas read failed: ${readErr.message}`);
  const allOwned = (back ?? []).every((row: any) => row.client_id === clientId);
  console.log(`  content_ideas: inserted ${rows.length}, read-back owner-filtered ${back?.length ?? 0}, all client_id===owner: ${allOwned}`);
  results.ideation = ideas.length >= 6 && (back?.length ?? 0) === rows.length && allOwned;
  console.log(`  GATE B: ${results.ideation ? "PASS ✓" : "FAIL ✗"}\n`);

  // ── GATE C — subreddit bug: ONE minimal REAL Apify run via shipped buildRedditInput ──
  console.log("─── GATE C: Reddit subreddit targeting (ONE minimal Apify run) ───");
  proveSubredditShape();
  const input: any = buildRedditInput(["loseit"]);
  // Minimise credits — same shape, fewer items. (Shipped defaults are 15.)
  input.maxItems = 3; input.maxPostCount = 3; input.maxComments = 1;
  console.log(`  starting Apify run: startUrls=${input.startUrls.map((u: any) => u.url).join(" ")} maxItems=${input.maxItems}`);
  const run = await startRedditRun(input);
  console.log(`  run ${run.id} status ${run.status}; polling…`);
  let status = run.status;
  for (let i = 0; i < 40 && !TERMINAL_STATUSES.has(status); i++) {
    await sleep(6000);
    const s = await getRedditRun(run.id);
    status = s.status;
    if (i % 3 === 0) console.log(`   …${status}`);
  }
  console.log(`  final run status: ${status}`);
  if (status === "SUCCEEDED") {
    const items = await getDatasetItems(run.defaultDatasetId);
    const str = (v: any) => (typeof v === "string" ? v : "");
    const communities = items.map((it) => (str(it.communityName) || str(it.subreddit) || str(it.parsedCommunityName)).toLowerCase());
    const withCommunity = communities.filter(Boolean);
    const allLoseit = withCommunity.length > 0 && withCommunity.every((c) => c.includes("loseit"));
    console.log(`  dataset items: ${items.length}; communities seen: ${[...new Set(withCommunity)].join(", ") || "(none labelled)"}`);
    const sample = items.find((it) => str(it.title));
    if (sample) console.log(`  sample post: "${str(sample.title).slice(0, 80)}" in ${str(sample.communityName) || str(sample.subreddit)}`);
    results.reddit = items.length > 0 && allLoseit;
    console.log(`  posts came FROM r/loseit (startUrls targeting worked, keyword-only bug NOT reproduced): ${allLoseit ? "yes ✓" : "no ✗"}`);
  } else {
    console.log(`  ⚠️  run did not SUCCEED — Apify gate INCONCLUSIVE (not a code fault unless FAILED on input).`);
    results.reddit = false;
  }
  console.log(`  GATE C: ${results.reddit ? "PASS ✓" : status === "SUCCEEDED" ? "FAIL ✗" : "INCONCLUSIVE"}\n`);

  // ── teardown + verdict ──
  console.log("Tearing down…");
  await teardown();
  const gone = await findAuthUser(E2E_EMAIL);
  console.log("auth user after teardown:", gone ? "STILL EXISTS (!!)" : "gone ✓");

  console.log("\n─── VERDICT ───");
  console.log("Gate A transcript analyser :", results.transcript ? "PASS" : "FAIL");
  console.log("Gate B ideation + write    :", results.ideation ? "PASS" : "FAIL");
  console.log("Gate C reddit subreddit fix:", results.reddit ? "PASS" : "FAIL/INCONCLUSIVE");
  const ok = results.transcript && results.ideation && results.reddit && !gone;
  console.log(ok ? "\n✓ ALL GATES PASS — no rows left behind." : "\n✗ NOT ALL GATES PASS — see above.");
  if (!ok) process.exitCode = 1;
}

const args = new Set(process.argv.slice(2));
try {
  if (args.has("--teardown")) { console.log("MODE: --teardown\n"); await teardown(); }
  else if (args.has("--selftest")) await runSelftest();
  else await runLive();
} catch (err: any) {
  console.error("\nFATAL:", err.message);
  await teardown({ quiet: true }).catch(() => {});
  process.exit(1);
}
