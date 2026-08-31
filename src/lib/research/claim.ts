import type { SupabaseClient } from "@supabase/supabase-js";
import { SHARED_CLIENT_ID } from "./types";

// The pipeline video claim, kept OUT of competitor.ts on purpose.
//
// competitor.ts is `import "server-only"`, and `server-only` is not a real
// package here — Next aliases it internally — so a Trigger.dev build cannot
// resolve it. The claim now runs from two places (the browser's server action
// after a run completes, and the claim-pipeline-videos task when the browser is
// gone), and the cross-tenant guard below must exist exactly once. So the logic
// lives here, takes its client as an argument, and both callers pass their own.

/**
 * Tag the videos a pipeline run just produced to this client. SMAI writes them
 * untagged (client_id NULL) with a date-granular `dateAdded` (YYYY-MM-DD) and the
 * run's `configName`. We claim: NULL rows whose configName matches AND whose
 * dateAdded is on/after the run's start day.
 *
 * CROSS-TENANT GUARD (Session 10): SMAI's pipeline scrapes EVERY creator in the
 * shared table (it ignores config.creatorsCategory — see reference/smai note), so
 * a run also produces videos for creators that belong to OTHER clients. We must
 * never let this client claim those. So we exclude any candidate whose `creator`
 * username is owned by a different client (a `creators` row whose client_id is
 * set, is not this client, and is not the shared sentinel). Shared creators stay
 * claimable by whoever claims first, exactly as they were when shared meant NULL
 * — without that exemption a scrape of a shared creator could never be claimed
 * by anyone, and since 0015 an unclaimed row is invisible, so it would vanish.
 * This makes cross-tenant video OWNERSHIP impossible regardless of what SMAI
 * scrapes. (Fully stopping the over-broad scrape is a SMAI-side fix.)
 *
 * Residual: two runs using the SAME configName on the SAME day could still claim
 * each other's shared/own videos (dateAdded is day-granular). Rare; count returned.
 */
export async function claimVideosFor(
  db: SupabaseClient,
  clientId: string,
  sinceDay: string,
  configName: string
): Promise<number> {
  if (!clientId || !configName || !sinceDay) {
    throw new Error("claimPipelineVideos requires clientId, configName and sinceDay.");
  }
  // Usernames owned by OTHER clients — their videos are off-limits to this claim.
  // The shared sentinel is not an "other client": shared creators stay claimable.
  const { data: otherCre, error: creErr } = await db
    .from("creators")
    .select("username, client_id")
    .not("client_id", "is", null)
    .neq("client_id", clientId)
    .neq("client_id", SHARED_CLIENT_ID);
  if (creErr) throw new Error(creErr.message);
  const blocked = new Set(
    (otherCre ?? []).map((r) => String((r as { username: unknown }).username).toLowerCase())
  );

  // Candidate rows from this run.
  const { data: cands, error: candErr } = await db
    .from("videos")
    .select("id, creator")
    .is("client_id", null)
    .eq("configName", configName)
    .gte("dateAdded", sinceDay);
  if (candErr) throw new Error(candErr.message);

  const claimIds = (cands ?? [])
    .filter((v) => !blocked.has(String((v as { creator: unknown }).creator ?? "").toLowerCase()))
    .map((v) => String((v as { id: unknown }).id));
  if (claimIds.length === 0) return 0;

  // Re-assert client_id IS NULL on the update so a concurrent claim can't double-tag.
  const { data, error } = await db
    .from("videos")
    .update({ client_id: clientId })
    .in("id", claimIds)
    .is("client_id", null)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}
