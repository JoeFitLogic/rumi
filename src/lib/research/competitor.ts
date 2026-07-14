import "server-only";

import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Video, Creator, CompetitorConfig, ConfigInput } from "./types";

// Server-side data layer for the per-client competitor tables (migration 0012).
//
// Ownership model:
//   * READS  → this client's rows (client_id = clientId) PLUS legacy/global rows
//              (client_id IS NULL, the pre-existing Cleo data). Both shown.
//   * WRITES → this client's OWN rows only (client_id = clientId AND id = ...).
//              Legacy NULL rows and other clients' rows are never mutated. This
//              is enforced on the query, so a service-role write can't stray.
//
// These tables are anon-unreadable (RLS) and Cleo-shared, so everything here
// uses the service role. The caller MUST have passed getActiveClient() first
// (see research/actions.ts authorize()).

const VIDEO_COLS =
  "id, link, thumbnail, creator, views, likes, comments, analysis, newConcepts, datePosted, configName, starred, client_id";
const CREATOR_COLS =
  "id, username, category, profilePicUrl, followers, reelsCount30d, avgViews30d, lastScrapedAt, client_id";
const CONFIG_COLS =
  "id, configName, creatorsCategory, analysisInstruction, newConceptsInstruction, client_id";

/** `client_id = clientId OR client_id IS NULL` — own rows + legacy/global. */
function ownedOrGlobal(clientId: string): string {
  return `client_id.eq.${clientId},client_id.is.null`;
}

function toVideo(r: Record<string, unknown>): Video {
  const n = (v: unknown) => (typeof v === "number" ? v : null);
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    id: String(r.id),
    link: s(r.link),
    thumbnail: s(r.thumbnail),
    creator: s(r.creator),
    views: n(r.views),
    likes: n(r.likes),
    comments: n(r.comments),
    analysis: s(r.analysis),
    newConcepts: s(r.newConcepts),
    datePosted: s(r.datePosted),
    configName: s(r.configName),
    starred: r.starred === true,
    clientId: s(r.client_id),
  };
}

export async function listVideos(clientId: string): Promise<Video[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("videos")
    .select(VIDEO_COLS)
    .or(ownedOrGlobal(clientId))
    .order("starred", { ascending: false })
    .order("views", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => toVideo(r as Record<string, unknown>));
}

export async function listCreators(clientId: string): Promise<Creator[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("creators")
    .select(CREATOR_COLS)
    .or(ownedOrGlobal(clientId))
    .order("followers", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const n = (v: unknown) => (typeof v === "number" ? v : null);
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id),
      username: String(row.username ?? ""),
      category: s(row.category),
      profilePicUrl: s(row.profilePicUrl),
      followers: n(row.followers),
      reelsCount30d: n(row.reelsCount30d),
      avgViews30d: n(row.avgViews30d),
      lastScrapedAt: s(row.lastScrapedAt),
      clientId: s(row.client_id),
    };
  });
}

export async function listConfigs(clientId: string): Promise<CompetitorConfig[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("configs")
    .select(CONFIG_COLS)
    .or(ownedOrGlobal(clientId))
    .order("configName", { ascending: true });
  if (error) throw new Error(error.message);
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id),
      configName: String(row.configName ?? ""),
      creatorsCategory: s(row.creatorsCategory),
      analysisInstruction: s(row.analysisInstruction),
      newConceptsInstruction: s(row.newConceptsInstruction),
      clientId: s(row.client_id),
    };
  });
}

/**
 * Star / unstar a video the client OWNS. Scoped by `client_id = clientId` so a
 * legacy/global row (client_id NULL) or another client's row can never flip.
 * Returns the number of rows changed (0 = not owned, silently a no-op).
 */
export async function setVideoStar(
  clientId: string,
  videoId: string,
  starred: boolean
): Promise<number> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("videos")
    .update({ starred })
    .eq("id", videoId)
    .eq("client_id", clientId)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/** Delete one video the client OWNS (never a legacy/global or other client's). */
export async function deleteVideo(
  clientId: string,
  videoId: string
): Promise<number> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("videos")
    .delete()
    .eq("id", videoId)
    .eq("client_id", clientId)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/**
 * Clear ALL of this client's OWN videos. The `client_id = clientId` filter is
 * mandatory and explicit — it must never widen to legacy/global rows. We refuse
 * to build the query without it.
 */
export async function clearOwnVideos(clientId: string): Promise<number> {
  if (!clientId) throw new Error("clearOwnVideos requires a clientId.");
  const db = createAdminClient();
  const { data, error } = await db
    .from("videos")
    .delete()
    .eq("client_id", clientId)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

// ── Configs (per-client write; Session 9) ─────────────────────────────────────
// Rumi-direct rather than via SMAI's /api/configs: SMAI writes untagged (NULL,
// shared) rows with no auth on the route, so round-tripping then tagging would
// be a racy two-step. A service-role insert with client_id set is atomic and
// matches the read-side owner-scoping. Legacy/global configs stay read-only.

function configRow(input: ConfigInput, clientId: string, id: string) {
  return {
    id,
    client_id: clientId,
    configName: input.configName.trim(),
    creatorsCategory: input.creatorsCategory.trim(),
    analysisInstruction: input.analysisInstruction.trim(),
    newConceptsInstruction: input.newConceptsInstruction.trim(),
  };
}

export async function createConfig(
  clientId: string,
  input: ConfigInput
): Promise<CompetitorConfig> {
  if (!input.configName.trim()) throw new Error("Config name is required.");
  const db = createAdminClient();
  const { data, error } = await db
    .from("configs")
    .insert(configRow(input, clientId, randomUUID()))
    .select(CONFIG_COLS)
    .single();
  if (error) throw new Error(error.message);
  const row = data as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    id: String(row.id),
    configName: String(row.configName ?? ""),
    creatorsCategory: s(row.creatorsCategory),
    analysisInstruction: s(row.analysisInstruction),
    newConceptsInstruction: s(row.newConceptsInstruction),
    clientId: s(row.client_id),
  };
}

/** Update a config the client OWNS (scoped `id AND client_id`). 0 = not owned. */
export async function updateConfig(
  clientId: string,
  id: string,
  input: ConfigInput
): Promise<number> {
  if (!input.configName.trim()) throw new Error("Config name is required.");
  const db = createAdminClient();
  const { client_id: _omit, id: _omit2, ...fields } = configRow(input, clientId, id);
  void _omit;
  void _omit2;
  const { data, error } = await db
    .from("configs")
    .update(fields)
    .eq("id", id)
    .eq("client_id", clientId)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/** Delete a config the client OWNS. Never a legacy/global or other client's. */
export async function deleteConfig(clientId: string, id: string): Promise<number> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("configs")
    .delete()
    .eq("id", id)
    .eq("client_id", clientId)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

// ── Creators (per-client add/delete; Session 9) ───────────────────────────────
// Add is Rumi-direct with client_id set + zeroed stats (SMAI's /api/creators-manage
// does the same insert but untagged). Stats are filled later by the refresh SSE,
// which only UPDATEs existing rows (and preserves client_id — its update object
// omits the column). Legacy/global creators stay read-only.

export async function createCreator(
  clientId: string,
  username: string,
  category: string
): Promise<Creator> {
  const u = username.trim().replace(/^@/, "");
  if (!u) throw new Error("Username is required.");
  const db = createAdminClient();
  const { data, error } = await db
    .from("creators")
    .insert({
      id: randomUUID(),
      client_id: clientId,
      username: u,
      category: category.trim(),
      profilePicUrl: "",
      followers: 0,
      reelsCount30d: 0,
      avgViews30d: 0,
      lastScrapedAt: "",
    })
    .select(CREATOR_COLS)
    .single();
  if (error) throw new Error(error.message);
  const row = data as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" ? v : null);
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    id: String(row.id),
    username: String(row.username ?? ""),
    category: s(row.category),
    profilePicUrl: s(row.profilePicUrl),
    followers: n(row.followers),
    reelsCount30d: n(row.reelsCount30d),
    avgViews30d: n(row.avgViews30d),
    lastScrapedAt: s(row.lastScrapedAt),
    clientId: s(row.client_id),
  };
}

/** Delete a creator the client OWNS. Never a legacy/global or other client's. */
export async function deleteCreator(clientId: string, id: string): Promise<number> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("creators")
    .delete()
    .eq("id", id)
    .eq("client_id", clientId)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/** The ids of creators this client OWNS — used to gate the refresh SSE so it
 *  never re-scrapes (mutates) a legacy/global or another client's creator. */
export async function ownedCreatorIds(clientId: string): Promise<Set<string>> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("creators")
    .select("id")
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => String((r as { id: unknown }).id)));
}

// ── Pipeline video claim (per-client tagging; Session 9) ──────────────────────

/**
 * Tag the videos a pipeline run just produced to this client. SMAI writes them
 * untagged (client_id NULL) with a date-granular `dateAdded` (YYYY-MM-DD) and the
 * run's `configName`. We claim: NULL rows whose configName matches AND whose
 * dateAdded is on/after the run's start day. Legacy rows (older days) are never
 * caught by the date bound; other clients' rows are excluded by `client_id IS NULL`.
 *
 * Residual: two runs using the SAME configName on the SAME day could claim each
 * other's videos (dateAdded is only day-granular). Rare in practice (config names
 * are per-client); the claimed count is returned so callers can surface it.
 */
export async function claimPipelineVideos(
  clientId: string,
  sinceDay: string,
  configName: string
): Promise<number> {
  if (!clientId || !configName || !sinceDay) {
    throw new Error("claimPipelineVideos requires clientId, configName and sinceDay.");
  }
  const db = createAdminClient();
  const { data, error } = await db
    .from("videos")
    .update({ client_id: clientId })
    .is("client_id", null)
    .eq("configName", configName)
    .gte("dateAdded", sinceDay)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}
