// ─────────────────────────────────────────────────────────────────────────
// Measure how often generate-strategy's model output is malformed JSON.
// COSTS REAL ANTHROPIC TOKENS: one Opus call per sample.
//
//   node scripts/measure-json-failures.mjs            # 10 Part B samples
//   node scripts/measure-json-failures.mjs --n 6 --part a
//
// WHY
//   src/trigger/generate-strategy.ts retries the WHOLE task (both parts) when
//   either part fails to parse, up to 3 attempts. Whether that is comfortable
//   or marginal depends entirely on the per-call failure rate, which nobody has
//   ever measured. This measures it, and also classifies each failure and tests
//   whether a STRUCTURAL-ONLY repair would have recovered it.
//
// SAFETY
//   No database access, no account, no writes outside .tmp-prompt-eval/.
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
const OUT = new URL("../.tmp-prompt-eval/", import.meta.url);
const CONCURRENCY = 4;

const argv = process.argv;
const flag = (name, fallback) => {
  const i = argv.indexOf(name);            // -1 when absent; argv[0] is the node
  return i === -1 ? fallback : argv[i + 1]; // binary, so guard before indexing
};
const N = Number(flag("--n", 10)) || 10;
const PART = String(flag("--part", "b")).toLowerCase();
if (!["a", "b"].includes(PART)) throw new Error(`--part must be a or b, got ${PART}`);

function promptFrom(file, constName) {
  const src = readFileSync(new URL(`../src/lib/prompts/${file}.ts`, import.meta.url), "utf8");
  const m = src.match(new RegExp(`export const ${constName} = ("(?:[^"\\\\]|\\\\.)*");`, "s"));
  return JSON.parse(m[1]);
}
const SYSTEM = PART === "a"
  ? promptFrom("strategy-part-a", "STRATEGY_PART_A")
  : promptFrom("strategy-part-b", "STRATEGY_PART_B");

const { buildOnboardingBlock } = await import("../.tmp-prompt-eval-lib/onboarding.mjs");
const block = buildOnboardingBlock(ANSWERS);

// ── the parser, exactly as src/lib/strategy-parse.ts does it ──
function slice(raw) {
  const stripped = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const first = stripped.indexOf("{"), last = stripped.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  return stripped.slice(first, last + 1);
}

// ── STRUCTURAL-ONLY repair, for diagnosis ────────────────────────────────
// Walks the text tracking string/escape state. It can only:
//   (a) delete a ',' that sits in STRUCTURAL position immediately before } or ]
//   (b) append missing ] / } closers at the very end
// It never inserts, deletes or alters a character inside a string literal, so
// it cannot change one character of section content. Returns {text, ops}.
function structuralRepair(text) {
  const ops = [];
  const out = [];
  let inString = false, escape = false;
  const stack = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out.push(c);
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out.push(c); continue; }
    if (c === "{" || c === "[") stack.push(c);
    if (c === "}" || c === "]") stack.pop();
    if (c === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === "}" || text[j] === "]") { ops.push(`dropped trailing comma at ${i}`); continue; }
    }
    out.push(c);
  }
  let repaired = out.join("");
  if (inString) { repaired += '"'; ops.push("closed an unterminated string"); }
  while (stack.length) {
    const open = stack.pop();
    repaired += open === "[" ? "]" : "}";
    ops.push(`appended missing ${open === "[" ? "]" : "}"}`);
  }
  return { text: repaired, ops };
}

function classify(msg) {
  if (/Expected double-quoted property name/i.test(msg)) return "trailing comma";
  if (/Unexpected end of JSON input|Unterminated/i.test(msg)) return "unclosed array/object";
  if (/Bad escaped character|Bad control character/i.test(msg)) return "stray backslash / control char";
  if (/Expected ',' or/i.test(msg)) return "missing delimiter";
  return "other";
}

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

async function sample(i) {
  const msg = await anthropic.messages.create({
    model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM,
    messages: [{ role: "user", content: block }],
  });
  const raw = msg.content.filter((c) => c.type === "text").map((c) => c.text).join("");
  const s = slice(raw);
  const r = { i, out: msg.usage.output_tokens, chars: raw.length };
  if (s === null) return { ...r, ok: false, kind: "no JSON object", repaired: false };
  try {
    const parsed = JSON.parse(s);
    return { ...r, ok: true, sections: parsed.sections?.length ?? 0 };
  } catch (e) {
    const kind = classify(e.message);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(new URL(`malformed-${PART}-${i}.json`, OUT), raw);
    // would a structural-only repair have saved it?
    const fix = structuralRepair(s);
    let repaired = false, sections = 0;
    try { const p = JSON.parse(fix.text); repaired = true; sections = p.sections?.length ?? 0; } catch { /* no */ }
    return { ...r, ok: false, kind, msg: e.message.slice(0, 70), repaired, sections, ops: fix.ops };
  }
}

// Wilson score interval — honest about small samples.
function wilson(k, n, z = 1.96) {
  if (n === 0) return [0, 1];
  const p = k / n, d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}

console.log(`measuring ${N} Part ${PART.toUpperCase()} calls, ${CONCURRENCY} at a time, model ${MODEL}\n`);
const results = [];
for (let start = 0; start < N; start += CONCURRENCY) {
  const batch = [];
  for (let i = start; i < Math.min(start + CONCURRENCY, N); i++) batch.push(sample(i + 1));
  for (const r of await Promise.all(batch)) {
    results.push(r);
    console.log(
      r.ok
        ? `  #${String(r.i).padStart(2)}  ok         ${r.sections} sections, ${r.out} out-tokens`
        : `  #${String(r.i).padStart(2)}  MALFORMED  ${r.kind}  (${r.out} out-tokens)` +
          (r.repaired ? `  -> structural repair recovers it (${r.sections} sections)` : `  -> structural repair does NOT recover it`)
    );
    if (!r.ok && r.ops?.length) console.log(`        repair ops: ${r.ops.join("; ")}`);
  }
}

const bad = results.filter((r) => !r.ok);
const [lo, hi] = wilson(bad.length, results.length);
const avgOut = Math.round(results.reduce((a, r) => a + r.out, 0) / results.length);

console.log(`\n── result ──`);
console.log(`  malformed: ${bad.length}/${results.length}  (${((bad.length / results.length) * 100).toFixed(0)}%)`);
console.log(`  95% confidence interval: ${(lo * 100).toFixed(1)}% to ${(hi * 100).toFixed(1)}%`);
console.log(`  mean output: ${avgOut} tokens`);
if (bad.length) {
  const kinds = {};
  bad.forEach((b) => { kinds[b.kind] = (kinds[b.kind] || 0) + 1; });
  console.log(`  failure kinds: ${Object.entries(kinds).map(([k, v]) => `${k} x${v}`).join(", ")}`);
  console.log(`  structural-only repair would recover: ${bad.filter((b) => b.repaired).length}/${bad.length}`);
}

// What the measured rate implies for the CURRENT coupled retry, and for
// retrying each part independently.
const f = bad.length / results.length;
const coupled = Math.pow(1 - Math.pow(1 - f, 2), 3);
const decoupled = 1 - Math.pow(1 - Math.pow(f, 3), 2);
console.log(`\n── what that means for a real strategy run (both parts, 3 attempts) ──`);
console.log(`  today (one failure re-runs both parts): ${(coupled * 100).toFixed(2)}% of runs fail outright`);
console.log(`  if each part retried independently:     ${(decoupled * 100).toFixed(2)}%`);
