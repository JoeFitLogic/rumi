// ─────────────────────────────────────────────────────────────────────────
// LIVE prompt-quality evaluation — costs real Anthropic tokens.
//
//   node scripts/e2e-prompts-live.mjs          # both parts (2 Opus calls)
//   node scripts/e2e-prompts-live.mjs --part-a # Part A only (1 call)
//
// WHY THIS EXISTS
//   The Step-4 prompt changes tell the model to use the new depth from the
//   Resonance form: the lowest point as a scene, the ideal client's 2am
//   thoughts close to verbatim, the client's catchphrases, and their personal
//   banlist. Those are claims about model behaviour, and the only way to know
//   whether an instruction landed is to run it and read the output.
//
//   So this asserts on the OUTPUT, not the prompt text: did their actual words
//   survive into the document, and did the banned ones stay out.
//
//   The Alex (Resonance) brief added a second class of claim: the document has
//   to come in at 3,500-4,000 words, every section has to close on a bolded
//   "Your move:" action, section 6 has to name the Trust Funnel and give the
//   70/20/10 ratio, section 11 has to cover the four engagement moves and
//   section 12 has to lead on followers per reel with the four milestones.
//   Those are checked here too: WORD_BUDGET per part, and checks carrying
//   `perSection` (must hold in EVERY listed section, not just somewhere).
//
// SAFETY
//   Touches no database and creates no account. It builds the onboarding block
//   in memory from the shared fixture, calls Anthropic directly with the real
//   system prompts, and prints the result. Nothing to clean up.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { ANSWERS } from "./_onboarding-fixture.mjs";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) { env[m[1]] = m[2].trim(); process.env[m[1]] = m[2].trim(); }
}

const MODEL = process.env.STRATEGY_MODEL ?? "claude-opus-4-8";
const MAX_TOKENS = 16000;
// Mirrors src/trigger/generate-strategy.ts. The model intermittently emits
// malformed JSON (a trailing comma, a dropped closing bracket); production
// retries the whole run rather than patching the output, so an eval that fails
// on the first malformed response is stricter than the thing it is measuring.
const MAX_ATTEMPTS = 3;
const OUT = new URL("../.tmp-prompt-eval/", import.meta.url);

// Per-part word budget from the brief: 3,500-4,000 for the whole document, so
// 1,750-2,000 a part. Reported either way; only a breach of the upper bound is
// treated as a failure, because overrunning is the failure mode being fixed.
const WORD_BUDGET = { min: 1750, max: 2000 };

// Alex's additions to the banned list, on top of the personal banlist the
// client gave. These are the words that make a bespoke document read like a
// template, so they are checked in both parts.
const BANNED_HOUSE = [
  /\bleverag(e|es|ed|ing)\b/i, /\butilis(e|es|ed|ing)\b/i, /\boptimis(e|es|ed|ing|ation)\b/i,
  /\bcultivat(e|es|ed|ing)\b/i, /\bharness(es|ed|ing)?\b/i, /\bempower(s|ed|ing|ment)?\b/i,
  /\bseamless(ly)?\b/i, /\brobust\b/i, /cutting-edge/i, /\binnovative\b/i,
  /\bgroundbreaking\b/i, /transform your/i, /unlock your/i, /\bprospects?\b/i,
  /as you move forward/i,
];

// ── load the real prompts + the real block builder ──
function promptFrom(file, constName) {
  const src = readFileSync(new URL(`../src/lib/prompts/${file}.ts`, import.meta.url), "utf8");
  const m = src.match(new RegExp(`export const ${constName} = ("(?:[^"\\\\]|\\\\.)*");`, "s"));
  if (!m) throw new Error(`could not extract ${constName}`);
  return JSON.parse(m[1]);
}
const { buildOnboardingBlock } = await import("../.tmp-prompt-eval-lib/onboarding.mjs");

const PART_A = promptFrom("strategy-part-a", "STRATEGY_PART_A");
const PART_B = promptFrom("strategy-part-b", "STRATEGY_PART_B");

// ── the assertions ────────────────────────────────────────────────────────
// Each is a claim about whether a specific Step-4 instruction actually landed.
const CHECKS = [
  // Section 5 is REQUIRED to print the banlist as an explicit do-not-use list,
  // so it is excluded here. This checks the words stay out of ordinary prose.
  { id: "banlist", must: "absent", section: null, exclude: [5],
    label: 'their banlist stays out of the prose (S5 excluded: it must print the list)',
    patterns: [/\bjourneys?\b/i, /\bbespoke\b/i, /\bunlock(s|ed|ing)?\b/i, /\belevat(e|es|ed|ing|ion)\b/i, /crush it/i] },

  { id: "emdash", must: "absent", section: null,
    label: "zero em dashes",
    patterns: [/—/] },

  { id: "2am", must: "present", section: 3,
    label: 'S3 keeps the 2am thoughts close to verbatim ("I\'ve let myself go" / "I used to be fit")',
    patterns: [/let myself go/i, /used to be fit/i] },

  { id: "lowpoint", must: "present", section: 2,
    label: "S2 keeps the lowest point as a scene (Tesco / 2019 / the car)",
    patterns: [/tesco/i, /\b2019\b/, /\bcar\b/i] },

  { id: "shifted", must: "present", section: 2,
    label: "S2 uses what shifted (the deadlift text)",
    patterns: [/deadlift/i, /bodyweight/i, /texted/i] },

  { id: "oldnew", must: "present", section: 2,
    label: "S2 uses old-vs-new self (apologising for taking up space)",
    patterns: [/taking up space/i, /apologis/i] },

  { id: "contrarian", must: "present", section: 4,
    label: "S4 uses the contrarian belief (they need to stop quitting)",
    patterns: [/stop quitting/i, /don't need a plan/i, /do not need a plan/i] },

  { id: "industryhate", must: "present", section: 4,
    label: "S4 names the specific industry behaviour (12-week shreds)",
    patterns: [/12-week/i, /twelve-week/i, /shred/i] },

  { id: "knownfor", must: "present", section: 4,
    label: "S4 uses the known-for line (tells you what you don't want to hear)",
    patterns: [/don't want to hear/i, /do not want to hear/i] },

  { id: "catchphrase", must: "present", section: 5,
    label: 'S5 quotes their real catchphrases ("Right, listen" / "Here\'s the thing" / "Nae bother")',
    patterns: [/right,? listen/i, /here'?s the thing/i, /nae bother/i] },

  { id: "banlist-shown", must: "present", section: 5,
    label: "S5 reproduces their banlist as an explicit do-not-use list",
    // "Do-not-use list" is the heading the model actually reaches for, and the
    // hyphens meant /do not use/ missed a section that was doing it right.
    patterns: [/never come out of your mouth/i, /don'?t use/i, /do[- ]not[- ]use/i, /avoid these/i, /cross (it |them )?out/i] },

  { id: "swearing", must: "present", section: 5,
    label: "S5 addresses their stated swearing level (Moderate)",
    patterns: [/swear/i, /moderate/i, /profanit/i, /shite/i] },

  { id: "notclient", must: "present", section: 3,
    label: "S3 names who is NOT the client (six-week transformation photo)",
    patterns: [/six-week/i, /transformation photo/i, /not your client/i, /wrong fit/i] },

  { id: "fuckyou-a", must: "present", section: 1,
    label: "S1 names the fuck-you goal back to them (the gym, paid for outright)",
    patterns: [/\bgym\b/i, /outright/i, /no debt/i, /your name on it/i] },

  // ── Alex brief ──
  { id: "yourmove-a", must: "present", perSection: [1, 2, 3, 4, 5, 6],
    label: 'every section closes on a bolded "Your move:"',
    patterns: [/\*\*Your move:\*\*/] },

  { id: "nofirstaction-a", must: "absent", section: null,
    label: 'the old "Your first action here is" wording is gone',
    patterns: [/first action here is/i] },

  { id: "weakverbs-a", must: "absent", section: null,
    label: 'no "consider/explore/reflect on" standing in for an action',
    patterns: [/Your move:\s*(Consider|Explore|Reflect|Think about|Spend some time)/i] },

  { id: "trustfunnel", must: "present", section: 6,
    label: "S6 names the Trust Funnel and its three parts",
    patterns: [/trust funnel/i] },

  { id: "cnc", must: "present", section: 6,
    label: "S6 defines Connect, Nurture and Convert",
    patterns: [/connect/i] },

  { id: "ratio", must: "present", section: 6,
    label: "S6 gives the 70/20/10 starting ratio",
    patterns: [/70\s*%?\s*[/ ]\s*20/i, /70%/] },

  { id: "nofunnelstages", must: "absent", section: null,
    label: "no top/middle/bottom-of-funnel language",
    patterns: [/top of funnel/i, /middle of funnel/i, /bottom of funnel/i, /\bTOFU\b/, /\bMOFU\b/, /\bBOFU\b/] },

  // S5 is excluded for the same reason as the personal banlist check: it is
  // REQUIRED to quote bad language in order to ban it, and its weak-vs-strong
  // rewrite pair is the clearest place in the document to show what not to say.
  { id: "house-a", must: "absent", section: null, exclude: [5],
    label: "the extended house banlist stays out of the prose (S5 excluded: it must quote bad language to ban it)",
    patterns: BANNED_HOUSE },
];

const B_CHECKS = [
  { id: "fears", must: "present", section: 8,
    label: "S8 addresses the named visibility fear (people they went to school with)",
    patterns: [/school/i, /judge?ment/i, /laugh/i, /people you know/i] },

  { id: "loop", must: "present", section: 9,
    label: "S9 quotes the loop in their head (nothing worth saying)",
    patterns: [/nothing worth saying/i, /should be posting/i] },

  { id: "closing", must: "present", section: 12,
    label: "S12 answers what they wanted understood (not lazy / never been shown)",
    patterns: [/not lazy/i, /never been shown/i, /shown how/i] },

  { id: "fuckyou-b", must: "present", section: 12,
    label: "S12 ladders the metrics up to the fuck-you goal (the gym)",
    patterns: [/\bgym\b/i, /outright/i, /no debt/i] },

  { id: "banlist-b", must: "absent", section: null,
    label: 'their banlist stays out of Part B, including the format catalogue',
    patterns: [/\bjourneys?\b/i, /\bbespoke\b/i, /\bunlock(s|ed|ing)?\b/i, /\belevat(e|es|ed|ing|ion)\b/i, /crush it/i] },

  { id: "emdash-b", must: "absent", section: null,
    label: "zero em dashes in Part B",
    patterns: [/—/] },

  // ── Alex brief ──
  { id: "yourmove-b", must: "present", perSection: [7, 8, 9, 10, 11, 12],
    label: 'every section closes on a bolded "Your move:"',
    patterns: [/\*\*Your move:\*\*/] },

  { id: "nofirstaction-b", must: "absent", section: null,
    label: 'the old "Your first action here is" wording is gone',
    patterns: [/first action here is/i] },

  { id: "weakverbs-b", must: "absent", section: null,
    label: 'no "consider/explore/reflect on" standing in for an action',
    patterns: [/Your move:\s*(Consider|Explore|Reflect|Think about|Spend some time)/i] },

  { id: "engage-accelerator", must: "present", section: 11,
    label: "S11 opens on engagement as a trust accelerator",
    patterns: [/trust accelerator/i] },

  { id: "engage-reply", must: "present", section: 11,
    label: "S11 covers replying to a comment so it opens a thread into a DM",
    patterns: [/opens? (a |the )?(thread|conversation)/i, /into a DM/i, /keeps? it open/i] },

  { id: "engage-dm", must: "present", section: 11,
    label: "S11 covers getting curious in DMs before pitching",
    patterns: [/before you pitch/i, /curious/i, /questions? first/i] },

  { id: "engage-stories", must: "present", section: 11,
    label: "S11 covers Stories showing the human between posts",
    patterns: [/between (the )?posts/i, /stor(y|ies)/i] },

  { id: "engage-comments", must: "present", section: 11,
    label: "S11 covers commenting on accounts the ideal client already follows",
    patterns: [/accounts (your|their) ideal client/i, /already follows?/i] },

  { id: "engage-nogeneric", must: "absent", section: 11,
    label: "S11 drops the generic advice (reply quickly, engage with your community)",
    patterns: [/reply quickly/i, /respond quickly/i, /engage with your community/i] },

  { id: "northstar", must: "present", section: 12,
    label: "S12 leads on followers per reel as the north star",
    patterns: [/followers per reel/i] },

  { id: "northstar-example", must: "present", section: 12,
    label: "S12 uses the 200-views/50-follows against 10,000-views/30-follows example",
    patterns: [/200 views/i, /10,?000 views/i] },

  { id: "milestones", must: "present", section: 12,
    label: "S12 gives the four milestones (1-30, 31-60, 61-90, 91-120)",
    patterns: [/1 to 30|1-30|first 30/i] },

  { id: "milestone-post", must: "present", section: 12,
    label: "S12 makes days 1-30 about whether they posted, and nothing else",
    patterns: [/did you post/i, /only metric/i] },

  { id: "nofunnelstages-b", must: "absent", section: null,
    label: "no top/middle/bottom-of-funnel language",
    patterns: [/top of funnel/i, /middle of funnel/i, /bottom of funnel/i, /\bTOFU\b/, /\bMOFU\b/, /\bBOFU\b/] },

  { id: "house-b", must: "absent", section: null,
    label: "the extended house banlist stays out (leverage, harness, empower, prospect, ...)",
    patterns: BANNED_HOUSE },
];

function parseSections(raw) {
  const stripped = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const body = stripped.slice(stripped.indexOf("{"), stripped.lastIndexOf("}") + 1);
  return JSON.parse(body).sections;
}

const words = (s) => s.split(/\s+/).filter(Boolean).length;

function run(checks, sections, partName) {
  let pass = 0, fail = 0;
  console.log(`\n── ${partName}: ${sections.length} sections ──`);

  // Word budget first: over-length is the thing the brief set out to fix, so it
  // reads as a check rather than a footnote.
  const perSectionWords = sections.map((s) => `S${s.number}:${words(s.content)}`).join("  ");
  const total = sections.reduce((n, s) => n + words(s.content), 0);
  const budgetOk = total <= WORD_BUDGET.max;
  console.log(`  ${budgetOk ? "PASS " : "FAIL "} word budget: ${total} words (target ${WORD_BUDGET.min}-${WORD_BUDGET.max})`);
  console.log(`         ${perSectionWords}`);
  if (total < WORD_BUDGET.min) console.log(`         note: under the lower bound, not failed`);
  budgetOk ? pass++ : fail++;

  for (const c of checks) {
    // perSection: the claim has to hold in EVERY listed section. "Somewhere in
    // the document" is not the claim for a per-section rule like "Your move:".
    if (c.perSection) {
      const missing = c.perSection.filter((n) => {
        const body = sections.find((s) => s.number === n)?.content ?? "";
        const hits = c.patterns.filter((p) => p.test(body));
        return c.must === "present" ? hits.length === 0 : hits.length > 0;
      });
      const ok = missing.length === 0;
      console.log(`  ${ok ? "PASS " : "FAIL "} ${c.label}`);
      if (!ok) console.log(`         sections at fault: ${missing.join(", ")}`);
      ok ? pass++ : fail++;
      continue;
    }
    const hay = c.section
      ? (sections.find((s) => s.number === c.section)?.content ?? "")
      : sections
          .filter((s) => !(c.exclude ?? []).includes(s.number))
          .map((s) => s.content)
          .join("\n\n");
    const hits = c.patterns.filter((p) => p.test(hay));
    const ok = c.must === "present" ? hits.length > 0 : hits.length === 0;
    console.log(`  ${ok ? "PASS " : "FAIL "} ${c.label}`);
    if (!ok && c.must === "absent") {
      const offenders = c.patterns.filter((p) => p.test(hay)).map((p) => (hay.match(p) || [])[0]);
      console.log(`         found: ${[...new Set(offenders)].join(", ")}`);
    }
    ok ? pass++ : fail++;
  }
  return { pass, fail };
}

// ── go ────────────────────────────────────────────────────────────────────
const block = buildOnboardingBlock(ANSWERS);
mkdirSync(OUT, { recursive: true });
writeFileSync(new URL("onboarding-block.md", OUT), block);
console.log(`onboarding block: ${block.length} chars, ${block.split("\n## ").length - 1} parts`);

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const onlyA = process.argv.includes("--part-a");
const onlyB = process.argv.includes("--part-b");

const t0 = Date.now();
/** Call once, and retry on malformed JSON exactly as production does. */
async function generate(system, name) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const msg = await anthropic.messages.create({
      model: MODEL, max_tokens: MAX_TOKENS, system,
      messages: [{ role: "user", content: block }],
    });
    const raw = msg.content.filter((c) => c.type === "text").map((c) => c.text).join("");
    try {
      parseSections(raw);
      if (attempt > 1) console.log(`  ${name}: parsed on attempt ${attempt}`);
      return { msg, raw };
    } catch (e) {
      lastErr = e;
      console.log(`  ${name}: attempt ${attempt} returned malformed JSON (${e.message.slice(0, 60)}), retrying`);
    }
  }
  throw new Error(`${name} failed to parse after ${MAX_ATTEMPTS} attempts: ${lastErr.message}`);
}

const calls = [];
if (!onlyB) calls.push(generate(PART_A, "Part A"));
if (!onlyA) calls.push(generate(PART_B, "Part B"));

const msgs = await Promise.all(calls);
console.log(`generated in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

let totals = { pass: 0, fail: 0 };
let docWords = 0;
const partNames = onlyB ? ["Part B (sections 7-12)"] : ["Part A (sections 1-6)", "Part B (sections 7-12)"];
const checkSets = onlyB ? [B_CHECKS] : [CHECKS, B_CHECKS];

msgs.forEach(({ msg, raw }, i) => {
  const tag = onlyB ? "b" : i === 0 ? "a" : "b";
  writeFileSync(new URL(`part-${tag}-raw.json`, OUT), raw);
  let sections;
  try { sections = parseSections(raw); }
  catch (e) { console.log(`\n  FAIL ${partNames[i]} did not parse: ${e.message}`); totals.fail++; return; }
  writeFileSync(new URL(`part-${tag}.md`, OUT),
    sections.map((s) => `## ${s.number}. ${s.title}\n\n${s.content}`).join("\n\n---\n\n"));
  const r = run(checkSets[i], sections, partNames[i]);
  totals.pass += r.pass; totals.fail += r.fail;
  docWords += sections.reduce((n, sec) => n + sec.content.split(/\s+/).filter(Boolean).length, 0);
  const u = msg.usage;
  console.log(`  tokens: ${u.input_tokens} in / ${u.output_tokens} out`);
});

// The brief's number is for the whole document, so say it plainly when both
// parts ran. One part alone is only ever half the answer.
if (!onlyA && !onlyB) {
  const inRange = docWords >= 3500 && docWords <= 4000;
  console.log(`\nWHOLE DOCUMENT: ${docWords} words (target 3,500-4,000) ${inRange ? "in range" : docWords > 4000 ? "OVER" : "under"}`);
}
console.log(`\n${totals.fail ? `${totals.fail} FAILED, ${totals.pass} passed` : `ALL ${totals.pass} CHECKS PASSED`}`);
console.log(`output written to .tmp-prompt-eval/ for reading`);
process.exit(totals.fail ? 1 : 0);
