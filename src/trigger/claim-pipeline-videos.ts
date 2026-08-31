import { logger, task, wait } from "@trigger.dev/sdk";
import { adminClient } from "./supabaseAdmin";
import { claimVideosFor } from "../lib/research/claim";
import { fetchPipelineRun } from "../lib/research/pipelineStatus";
import { PIPELINE_TERMINAL } from "../lib/research/types";

// Claim a competitor scrape's videos to the client who ran it, without needing
// the browser to be there.
//
// THE PROBLEM. SMAI writes scraped videos untagged (client_id NULL), and they
// only become a client's when claimVideosFor tags them. Until this task, the
// only thing that called it was the Run Pipeline tab: a setInterval that polls
// the run and claims when it sees COMPLETED. Close the tab, lose the connection,
// or walk away mid-scrape and the claim never happens. Since sql/0015 an
// unclaimed row is readable by NOBODY, so the client's own scrape results just
// silently never appear. That is what this fixes.
//
// The browser claim stays. It is instant when the tab IS open, and claiming
// twice is harmless: the claim only ever touches rows that are still NULL, and
// the update re-asserts `client_id IS NULL` so two claims cannot double-tag.
//
// WHY POLL RATHER THAN SUBSCRIBE. The run belongs to SMAI's Trigger.dev project,
// not ours. All we hold is the scoped public token SMAI minted for it, which
// reads that one run over HTTP. Waits between polls are durable, so the task is
// checkpointed rather than burning compute while it sleeps.

/** How long to keep watching before claiming anyway and giving up. */
const MAX_WAIT_SECONDS = 45 * 60;
const POLL_SECONDS = 20;
/** Consecutive status-read failures before we stop trusting the token. */
const MAX_STATUS_FAILURES = 5;
/** A late-write safety net: claim once more this long after the first claim. */
const SECOND_CLAIM_DELAY_SECONDS = 45;

export interface ClaimPipelineVideosPayload {
  clientId: string;
  runId: string;
  /** SMAI's scoped read-only token for this one run. */
  publicToken: string;
  /** Day-stamped BEFORE the run started, so the claim's date bound can't miss. */
  sinceDay: string;
  configName: string;
}

export const claimPipelineVideosTask = task({
  id: "claim-pipeline-videos",
  // Long enough to outlast a slow scrape. The task sleeps through almost all of
  // it in durable waits rather than running.
  maxDuration: MAX_WAIT_SECONDS + 300,
  retry: { maxAttempts: 2 },
  run: async (payload: ClaimPipelineVideosPayload) => {
    const { clientId, runId, publicToken, sinceDay, configName } = payload;
    if (!clientId || !runId || !sinceDay || !configName) {
      throw new Error("claim-pipeline-videos needs clientId, runId, sinceDay and configName.");
    }

    const db = adminClient();
    const deadline = Date.now() + MAX_WAIT_SECONDS * 1000;
    let status = "UNKNOWN";
    let statusFailures = 0;
    let watchable = true;

    // ── Watch the run ────────────────────────────────────────────────────────
    while (Date.now() < deadline) {
      try {
        const res = await fetchPipelineRun(runId, publicToken);
        status = res.status;
        statusFailures = 0;
        if (PIPELINE_TERMINAL.has(status)) break;
      } catch (e) {
        statusFailures++;
        logger.warn("Could not read the pipeline run's status", {
          runId,
          statusFailures,
          message: e instanceof Error ? e.message : String(e),
        });
        // The public token is short-lived. Losing sight of the run is NOT a
        // reason to abandon the videos: we know the config and the day, which is
        // all the claim actually needs, so stop watching and go claim.
        if (statusFailures >= MAX_STATUS_FAILURES) {
          watchable = false;
          break;
        }
      }
      await wait.for({ seconds: POLL_SECONDS });
    }

    const timedOut = watchable && !PIPELINE_TERMINAL.has(status);
    logger.log("Done watching the pipeline run", { runId, status, watchable, timedOut });

    // ── Claim ────────────────────────────────────────────────────────────────
    //
    // Deliberately claims even when the run failed, was cancelled, went dark or
    // outran the deadline. SMAI writes videos as it analyses them, so a run that
    // died late still produced real rows, and leaving them NULL means nobody can
    // ever see them. The claim is scoped to this config + day and skips creators
    // owned by other clients, so a claim that finds nothing simply returns 0.
    let claimed = await claimVideosFor(db, clientId, sinceDay, configName);
    logger.log("First claim", { clientId, configName, sinceDay, claimed, status });

    // A second pass catches anything written in the moments around completion.
    await wait.for({ seconds: SECOND_CLAIM_DELAY_SECONDS });
    const late = await claimVideosFor(db, clientId, sinceDay, configName);
    if (late > 0) logger.log("Late writes claimed", { clientId, late });
    claimed += late;

    if (claimed === 0) {
      // Not an error: the browser may have claimed them first, which is the
      // happy path whenever the client stayed on the tab.
      logger.log("Nothing left to claim", { clientId, runId, status });
    }

    return { claimed, status, timedOut, watchable };
  },
});
