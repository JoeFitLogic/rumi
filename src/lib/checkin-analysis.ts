import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CHECKIN_ANALYSIS_SYSTEM } from "@/lib/prompts/checkin-analysis";
import { type CheckinRow } from "@/lib/checkin";
import { buildAnalysisInput, parseAnalysis, rowHasContent } from "@/lib/checkin-analysis-core";

// Sonnet-tier per porting-notes; overridable via env without a code change.
const MODEL = process.env.CHECKIN_ANALYSIS_MODEL ?? "claude-sonnet-4-6";
const MAX_TOKENS = 1600;
const TREND_WEEKS = 6;

export interface AnalysisResult {
  status: "analysed" | "skipped" | "errored";
  weekStarting: string;
  hadRedFlags?: boolean;
  reason?: string;
  error?: string;
}

function textFromMessage(msg: { content: Array<{ type: string; text?: string }> }): string {
  return msg.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
}

/** Latest week_starting that has a checkin_responses row for this client, or null. */
export async function latestWeekWithData(
  db: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await db
    .from("checkin_responses")
    .select("week_starting")
    .eq("user_id", userId)
    .order("week_starting", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { week_starting?: string } | null)?.week_starting?.slice(0, 10) ?? null;
}

/**
 * Analyse one client's given week: pull up to TREND_WEEKS of trailing responses,
 * call Claude, upsert one checkin_analysis row. Owner-scoped throughout. Never
 * throws for "no data" (returns skipped) — only a real failure returns errored,
 * so a single client can't take the cron down.
 */
export async function analyzeClientWeek(
  db: SupabaseClient,
  userId: string,
  weekStarting: string,
  clientName: string
): Promise<AnalysisResult> {
  try {
    const { data: rowsDesc, error } = await db
      .from("checkin_responses")
      .select("*")
      .eq("user_id", userId)
      .lte("week_starting", weekStarting)
      .order("week_starting", { ascending: false })
      .limit(TREND_WEEKS);
    if (error) throw new Error(error.message);

    const weeks = ((rowsDesc ?? []) as CheckinRow[]).slice().reverse();
    const target = weeks.find((w) => w.week_starting.slice(0, 10) === weekStarting);
    if (!target) return { status: "skipped", weekStarting, reason: "no check-in for this week" };
    if (!rowHasContent(target)) return { status: "skipped", weekStarting, reason: "check-in is blank" };

    const userMessage = buildAnalysisInput(clientName, weeks);
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: CHECKIN_ANALYSIS_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    });

    const parsed = parseAnalysis(textFromMessage(msg));

    const { error: upErr } = await db.from("checkin_analysis").upsert(
      {
        user_id: userId,
        week_starting: weekStarting,
        red_flags: parsed.red_flags || null,
        plateaus: parsed.plateaus || null,
        themes: parsed.themes || null,
        recommendations: parsed.recommendations || null,
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id,week_starting" }
    );
    if (upErr) throw new Error(upErr.message);

    return { status: "analysed", weekStarting, hadRedFlags: !!parsed.red_flags };
  } catch (e) {
    return {
      status: "errored",
      weekStarting,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
