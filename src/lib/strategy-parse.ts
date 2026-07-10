// Strategy JSON parsing + validation, ported from the old n8n parse node.
// Pure functions (no I/O) so they're unit-testable and safe to import anywhere.

export interface StrategySection {
  number: number;
  title: string;
  content: string;
}

function normaliseSection(s: unknown): StrategySection {
  const obj = (s ?? {}) as Record<string, unknown>;
  const number = Number(obj.number);
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const content = typeof obj.content === "string" ? obj.content : "";
  if (!Number.isInteger(number) || number < 1 || number > 12) {
    throw new Error(`Invalid section number: ${JSON.stringify(obj.number)}`);
  }
  if (!title) throw new Error(`Section ${number} is missing a title`);
  if (!content.trim()) throw new Error(`Section ${number} is missing content`);
  return { number, title, content };
}

/**
 * Parse one Part's raw model output into sections.
 * Steps (per porting-notes): strip code fences → substring first { to last }
 * → JSON.parse → expect a `sections` array.
 */
export function parseStrategyPart(raw: string): StrategySection[] {
  const stripped = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("No JSON object found in model output");
  }
  const slice = stripped.slice(first, last + 1);

  let obj: unknown;
  try {
    obj = JSON.parse(slice);
  } catch (e) {
    throw new Error(`JSON.parse failed: ${(e as Error).message}`);
  }

  const sections = (obj as { sections?: unknown })?.sections;
  if (!Array.isArray(sections)) {
    throw new Error("Parsed output has no `sections` array");
  }
  return sections.map(normaliseSection);
}

/**
 * Combine parts, sort by number, dedupe (first occurrence wins), and HARD FAIL
 * unless the result is exactly sections 1..12.
 */
export function combineSections(
  ...parts: StrategySection[][]
): StrategySection[] {
  const byNumber = new Map<number, StrategySection>();
  for (const part of parts) {
    for (const s of part) {
      if (!byNumber.has(s.number)) byNumber.set(s.number, s);
    }
  }
  const sections = [...byNumber.values()].sort((a, b) => a.number - b.number);

  if (sections.length !== 12) {
    throw new Error(
      `Expected exactly 12 sections, got ${sections.length} (numbers: ${sections
        .map((s) => s.number)
        .join(", ")})`
    );
  }
  for (let i = 0; i < 12; i++) {
    if (sections[i].number !== i + 1) {
      throw new Error(
        `Section numbering is wrong: expected ${i + 1} at position ${i}, got ${sections[i].number}`
      );
    }
  }
  return sections;
}
