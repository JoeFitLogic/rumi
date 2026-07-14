import "server-only";
import type { PipelineParams, PipelineRunStatus, PipelineProgress } from "./types";

// SMAI (social-media-ai) API client — SERVER-SIDE ONLY.
//
// The SMAI app (social-media-ai-theta.vercel.app) owns the competitor scrape +
// analysis pipeline. Rumi never calls it from the browser: the shared secret
// must never reach client code. Every call goes through a server action / route
// handler and injects `x-api-secret` from env here.
//
// Config (both read from env so they can be rotated without a code change):
//   SMAI_API_SECRET  — the shared secret. SMAI checks it as `INTERNAL_API_SECRET`
//                      on /api/results only; we send it on every call as
//                      `x-api-secret` (harmless on the unauthenticated write routes).
//   SMAI_BASE_URL    — base URL. Falls back to the known prod host if unset.
//
// STATUS (Session 9): the two flows that genuinely need SMAI's compute are wired
// here — the pipeline trigger (Trigger.dev) and the creator-refresh SSE (Apify).
// Config CRUD and creator add/delete are done Rumi-direct in competitor.ts (SMAI
// writes untagged NULL rows via the anon key with no route auth, so a service-role
// insert with client_id set is cleaner + atomic than round-tripping then tagging).
// Pipeline videos land untagged; competitor.ts:claimPipelineVideos tags them.

const DEFAULT_BASE = "https://social-media-ai-theta.vercel.app";

export function smaiBaseUrl(): string {
  return (process.env.SMAI_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
}

function smaiSecret(): string {
  const s = process.env.SMAI_API_SECRET;
  if (!s) throw new Error("SMAI_API_SECRET is not set.");
  return s;
}

/**
 * Fetch against the SMAI API with the shared secret injected. Server-only.
 * `path` is joined to SMAI_BASE_URL (e.g. "/api/results?limit=10").
 */
export async function smaiFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(`${smaiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "x-api-secret": smaiSecret(),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

/**
 * Trigger a scrape+analyse pipeline run. SMAI hands back a Trigger.dev run id and
 * a scoped public token; the caller subscribes to run progress with that token
 * and, on completion, claims the produced videos to the client
 * (competitor.ts:claimPipelineVideos). The run writes videos untagged (NULL).
 */
export async function startPipeline(
  params: PipelineParams
): Promise<{ runId: string; publicToken: string }> {
  const res = await smaiFetch("/api/pipeline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(`Failed to start pipeline (SMAI ${res.status}).`);
  }
  const data = (await res.json()) as { runId?: string; publicToken?: string };
  if (!data.runId || !data.publicToken) {
    throw new Error("SMAI pipeline did not return a run handle.");
  }
  return { runId: data.runId, publicToken: data.publicToken };
}

/**
 * Refresh 30-day stats for the given creator ids (Apify scrape) — returns the
 * raw SSE Response so a route handler can pipe it straight to the browser.
 * SMAI updates each creator in place by id and, because its update object omits
 * client_id, leaves our per-client tagging intact. The CALLER must pass ONLY ids
 * the client owns (see competitor.ts:ownedCreatorIds) — an empty list makes SMAI
 * stream a single `complete` event with no scrape.
 */
export async function refreshCreatorsStream(ids: string[]): Promise<Response> {
  return smaiFetch("/api/creators/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}

// Trigger.dev run status — polled with the run's PUBLIC token (not the SMAI
// secret). SMAI's /api/pipeline mints `auth.createPublicToken({read:{runs:[id]}})`;
// that token reads exactly this run from the Trigger.dev API. This is how we show
// live progress without adding @trigger.dev/react-hooks or holding a Trigger key.
const TRIGGER_API = (process.env.TRIGGER_API_URL || "https://api.trigger.dev").replace(/\/+$/, "");

export async function fetchPipelineRun(
  runId: string,
  publicToken: string
): Promise<PipelineRunStatus> {
  const res = await fetch(`${TRIGGER_API}/api/v3/runs/${runId}`, {
    headers: { Authorization: `Bearer ${publicToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to read run status (Trigger ${res.status}).`);
  const j = (await res.json()) as {
    status?: string;
    metadata?: { progress?: PipelineProgress };
    data?: { status?: string; metadata?: { progress?: PipelineProgress } };
  };
  const status = j.status ?? j.data?.status ?? "UNKNOWN";
  const progress = j.metadata?.progress ?? j.data?.metadata?.progress ?? null;
  return { status, progress };
}
