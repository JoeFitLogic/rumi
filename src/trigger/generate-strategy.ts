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
// Retried so a rare malformed-JSON slip from the model gets a clean second shot
// rather than binning the run. Only the final attempt marks 'failed' + emails Joe.
const MAX_ATTEMPTS = 3;

export interface GenerateStrategyPayload {
  strategyId: string;
  userId: string;
  onboardingId: string | null;
}

// Derived from createClient's own signature so we don't deep-import a type out
// of @supabase/realtime-js (a transitive dep that supabase-js does not re-export).
type RealtimeTransport = NonNullable<
  NonNullable<Parameters<typeof createClient>[2]>["realtime"]
>["transport"];

/**
 * A WebSocket constructor that is never actually constructed.
 *
 * supabase-js builds a RealtimeClient eagerly inside createClient, and that
 * constructor resolves a transport up front (RealtimeClient._initializeOptions):
 *
 *   result.transport = options?.transport ?? WebSocketFactory.getWebSocketConstructor()
 *
 * On a runtime with no global WebSocket, getWebSocketConstructor() throws
 * "Node.js detected but native WebSocket not found" — at CLIENT CONSTRUCTION,
 * before a single query runs. That is what broke this task in production.
 *
 * Supplying `transport` short-circuits the `??`, so the factory is never
 * consulted and nothing probes the runtime for a WebSocket. This task only
 * reads and writes rows over HTTP and never opens a channel, so this is never
 * instantiated — it throws loudly if that ever stops being true.
 */
const NO_REALTIME = class {
  constructor() {
    throw new Error(
      "generate-strategy does not use Supabase realtime — no WebSocket transport is configured."
    );
  }
} as unknown as RealtimeTransport;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: NO_REALTIME },
    }
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
  retry: { maxAttempts: MAX_ATTEMPTS },
  maxDuration: 900,
  run: async (payload: GenerateStrategyPayload, { ctx }) => {
    const { strategyId, userId, onboardingId } = payload;

    // NOTHING that can throw is allowed outside this try.
    //
    // The Supabase client and the row loads used to sit ABOVE it, so anything
    // that failed during setup — the realtime WebSocket probe, a missing row, a
    // transient DB error — escaped the catch entirely. The strategy then sat at
    // 'pending' forever: no status change, no failure email, no signal
    // anywhere, and the release cron ignores it because that only picks up
    // 'complete'. A strategy that silently never generates is the worst
    // outcome this task has, so setup now gets the same reporting as
    // generation itself.
    let dbForCleanup: ReturnType<typeof admin> | undefined;
    // Falls back to the id so a failure that dies before the row loads still
    // produces an email you can act on.
    let clientName = `the client (strategy ${strategyId})`;

    try {
      const db = admin();
      dbForCleanup = db;

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

      clientName = strategy.client_name || profile?.name || clientName;

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
      const attempt = ctx.attempt.number;
      const isFinalAttempt = attempt >= MAX_ATTEMPTS;

      // The failure path has to work even when the failure WAS the setup, so it
      // can't assume the try ever produced a client. Build one here if not, and
      // if even that fails, carry on to the email — reporting the failure to a
      // human matters more than the DB tidy-up.
      let db = dbForCleanup;
      if (!db) {
        try {
          db = admin();
        } catch (clientErr) {
          logger.error("Could not build a Supabase client to report the failure", {
            strategyId,
            message:
              clientErr instanceof Error ? clientErr.message : String(clientErr),
          });
        }
      }

      // Always clear partial sections so the next attempt starts clean.
      if (db) {
        await db.from("strategy_sections").delete().eq("strategy_id", strategyId);
      }

      if (!isFinalAttempt) {
        // Transient slip (usually malformed JSON). Retry without touching the
        // client-visible status or emailing Joe about a run that may still succeed.
        logger.warn("Strategy attempt failed, retrying", {
          strategyId,
          attempt,
          maxAttempts: MAX_ATTEMPTS,
          message,
        });
        throw err;
      }

      logger.error("Strategy generation failed", { strategyId, attempt, message });
      if (db) {
        await db
          .from("strategies")
          .update({ status: "failed" })
          .eq("id", strategyId);
      }
      // Sent even if the status write above was impossible — an unreported
      // failure is exactly the hole this task just fell into.
      await sendGenerationFailedEmail({ clientName, error: message });

      // Rethrow so the run shows as errored in the Trigger dashboard.
      throw err;
    }
  },
});
