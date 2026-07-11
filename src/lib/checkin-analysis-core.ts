// Pure (no server-only / no SDK) core for check-in analysis: builds the model's
// input digest and parses its JSON output. Split out from checkin-analysis.ts so
// the sanctioned E2E harness can exercise the REAL builder + parser without
// pulling in "server-only" or the Anthropic SDK.

import { FIELDS, weekLabel, type CheckinRow } from "@/lib/checkin";

// Short, readable names for the numeric digest table.
export const NUM_LABEL: Record<string, string> = {
  calls_attended: "calls attended",
  calls_offered: "calls offered",
  calls_booked: "calls booked",
  calls_taken: "calls taken",
  sales_made: "sales",
  cash_collected: "cash collected",
  cash_contracted: "cash contracted",
  month_revenue: "month revenue",
  followers_gained: "followers gained",
  content_volume: "content posted",
  story_sequences: "story sequences",
  dm_confidence: "DM confidence",
  content_satisfaction: "content satisfaction",
  mindset_score: "mindset",
};

const NUMERIC = FIELDS.filter((f) => f.kind === "int" || f.kind === "money" || f.kind === "slider");
const TEXTUAL = FIELDS.filter((f) => f.kind === "text" || f.kind === "longtext");

function fmtNumberField(kind: string, raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "";
  if (kind === "money") return `£${Number(raw).toLocaleString("en-GB")}`;
  if (kind === "slider") return `${raw}/10`;
  return String(raw);
}

/** True if a week's row carries anything worth analysing (any number or any text). */
export function rowHasContent(row: CheckinRow): boolean {
  const r = row as unknown as Record<string, unknown>;
  for (const f of NUMERIC) if (r[f.column] !== null && r[f.column] !== undefined) return true;
  for (const f of TEXTUAL) if (r[f.column] && String(r[f.column]).trim()) return true;
  if (r.calls_attended_note && String(r.calls_attended_note).trim()) return true;
  if (Array.isArray(r.stuck_areas) && r.stuck_areas.length > 0) return true;
  return false;
}

/**
 * Build the user message: a readable digest of the client's last several weeks —
 * a per-week numbers line, then each week's own words. Only non-empty values are
 * included so the model isn't fed a wall of nulls.
 */
export function buildAnalysisInput(clientName: string, weeksAsc: CheckinRow[]): string {
  const parts: string[] = [
    `CLIENT: ${clientName}`,
    `WEEKS OF DATA: ${weeksAsc.length} (oldest first). Current week is the last one.`,
    "",
    "WEEKLY NUMBERS",
  ];

  for (const row of weeksAsc) {
    const r = row as unknown as Record<string, unknown>;
    const bits: string[] = [];
    for (const f of NUMERIC) {
      const v = fmtNumberField(f.kind, r[f.column]);
      if (v) bits.push(`${NUM_LABEL[f.column] ?? f.column} ${v}`);
    }
    parts.push(`- Week of ${weekLabel(row.week_starting)}: ${bits.length ? bits.join(", ") : "no numbers entered"}`);
  }

  parts.push("", "THEIR WORDS, WEEK BY WEEK");
  for (const row of weeksAsc) {
    const r = row as unknown as Record<string, unknown>;
    const lines: string[] = [];

    const note = r.calls_attended_note;
    if (note && String(note).trim()) lines.push(`  - Calls attended note: "${String(note).trim()}"`);

    for (const f of TEXTUAL) {
      const v = r[f.column];
      if (v && String(v).trim()) lines.push(`  - ${f.label}\n    "${String(v).trim()}"`);
    }

    const stuck = Array.isArray(r.stuck_areas) ? (r.stuck_areas as string[]) : [];
    if (stuck.length) lines.push(`  - Where they feel most stuck: ${stuck.join(", ")}`);

    if (lines.length) {
      parts.push(`Week of ${weekLabel(row.week_starting)}:`);
      parts.push(...lines);
      parts.push("");
    }
  }

  return parts.join("\n").trim();
}

export interface ParsedAnalysis {
  red_flags: string;
  plateaus: string;
  themes: string;
  recommendations: string;
}

/** Defensive JSON parse: strip fences, take first { to last }, coerce fields to strings. */
export function parseAnalysis(raw: string): ParsedAnalysis {
  let s = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1);
  const obj = JSON.parse(s) as Record<string, unknown>;
  const str = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (Array.isArray(v)) return v.map((x) => String(x)).join("\n");
    return String(v).trim();
  };
  return {
    red_flags: str(obj.red_flags),
    plateaus: str(obj.plateaus),
    themes: str(obj.themes),
    recommendations: str(obj.recommendations),
  };
}
