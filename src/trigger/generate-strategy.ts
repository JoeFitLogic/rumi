import { logger, task } from "@trigger.dev/sdk";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { STRATEGY_PART_A } from "../lib/prompts/strategy-part-a";
import { STRATEGY_PART_B } from "../lib/prompts/strategy-part-b";
import { buildOnboardingBlock } from "../lib/onboarding";
import {
  combineSections,
  parseStrategyPart,
  type StrategySection,
} from "../lib/strategy-parse";
import {
  sendReviewReadyEmail,
  sendGenerationFailedEmail,
} from "../lib/email";

// Opus-tier. Overridable via env without a code change.
const MODEL = process.env.STRATEGY_MODEL ?? "claude-opus-4-8";
const MAX_TOKENS = 16000;

export interface GenerateStrategyPayload {
  strategyId: string;
  userId: string;
  onboardingId: string | null;
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function textFromMessage(msg: {
  content: Array<{ type: string; text?: string }>;
}): string {
  return msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

export const generateStrategy = task({
  id: "generate-strategy",
  // One deterministic run — on failure we mark 'failed' and email Joe, rather
  // than silently regenerating (which would burn Opus calls + risk dupes).
  retry: { maxAttempts: 1 },
  maxDuration: 900,
  run: async (payload: GenerateStrategyPayload) => {
    const db = admin();
    const { strategyId, userId, onboardingId } = payload;

    // Load the strategy + onboarding + client email.
    const { data: strategy } = await db
      .from("strategies")
      .select("id, user_id, client_name, onboarding_id")
      .eq("id", strategyId)
      .single();
    if (!strategy) throw new Error(`Strategy ${strategyId} not found`);

    const { data: onboarding } = await db
      .from("onboarding_responses")
      .select("*")
      .eq("id", onboardingId ?? strategy.onboarding_id)
      .maybeSingle();
    if (!onboarding) throw new Error(`Onboarding row not found for strategy ${strategyId}`);

    const { data: profile } = await db
      .from("profiles")
      .select("name, email")
      .eq("id", userId)
      .maybeSingle();

    const clientName: string =
      strategy.client_name || profile?.name || "the client";

    try {
      await db
        .from("strategies")
        .update({ status: "generating" })
        .eq("id", strategyId);

      const userMessage = buildOnboardingBlock(onboarding);
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

      logger.info("Generating strategy", { strategyId, clientName, model: MODEL });

      // Part A (1-6) and Part B (7-12) in parallel — B does not see A's output.
      const [msgA, msgB] = await Promise.all([
        anthropic.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: STRATEGY_PART_A,
          messages: [{ role: "user", content: userMessage }],
        }),
        anthropic.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: STRATEGY_PART_B,
          messages: [{ role: "user", content: userMessage }],
        }),
      ]);

      const partA = parseStrategyPart(textFromMessage(msgA));
      const partB = parseStrategyPart(textFromMessage(msgB));
      const sections: StrategySection[] = combineSections(partA, partB);

      // Idempotent write: clear any prior sections (covers regenerate/retry).
      await db.from("strategy_sections").delete().eq("strategy_id", strategyId);
      const { error: insErr } = await db.from("strategy_sections").insert(
        sections.map((s) => ({
          strategy_id: strategyId,
          user_id: userId,
          section_number: s.number,
          section_title: s.title,
          content: s.content,
          status: "complete",
        }))
      );
      if (insErr) throw new Error(`Failed to insert sections: ${insErr.message}`);

      await db
        .from("strategies")
        .update({ status: "complete", completed_at: new Date().toISOString() })
        .eq("id", strategyId);

      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
      const emailRes = await sendReviewReadyEmail({
        clientName,
        deepLink: `${siteUrl}/strategy?as=${userId}`,
      });
      logger.info("Strategy complete", { strategyId, reviewEmail: emailRes.ok });

      return { ok: true, sections: sections.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Strategy generation failed", { strategyId, message });

      // Clean up any partial sections, mark failed, alert Joe.
      await db.from("strategy_sections").delete().eq("strategy_id", strategyId);
      await db
        .from("strategies")
        .update({ status: "failed" })
        .eq("id", strategyId);
      await sendGenerationFailedEmail({ clientName, error: message });

      // Rethrow so the run shows as errored in the Trigger dashboard.
      throw err;
    }
  },
});
