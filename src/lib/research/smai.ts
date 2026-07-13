import "server-only";

// SMAI (social-media-ai) API client — SERVER-SIDE ONLY.
//
// The SMAI app (social-media-ai-theta.vercel.app) owns the competitor scrape +
// analysis pipeline. Rumi never calls it from the browser: the shared secret
// must never reach client code. Every call goes through a server action / route
// handler and injects `x-api-secret` from env here.
//
// Config (both read from env so they can be rotated without a code change):
//   SMAI_API_SECRET  — the shared secret (currently cleo_smai_secret_2024). Required.
//   SMAI_BASE_URL    — base URL. Falls back to the known prod host if unset, but
//                      SET IT in .env.local + Vercel so it's explicit + rotatable.
//
// STATUS (Session 8): only the READ surface is confirmed and used elsewhere
// (Rumi reads videos/creators/configs straight from Supabase, per-client). The
// WRITE / action surface (POST /api/pipeline, /api/creators, config CRUD, the
// creator-refresh SSE stream) is HELD until the SMAI repo is cloned into
// reference/ and the real contract — including how it accepts + tags a
// per-client `client_id` — is known. `smaiFetch` is the seam those actions
// will use; do not reverse-engineer the POST endpoints against the live shared
// pipeline in the meantime.

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
