import { getActiveClient } from "@/lib/activeClient";
import { ownedCreatorIds } from "@/lib/research/competitor";
import { refreshCreatorsStream } from "@/lib/research/smai";

// Server-side proxy for the SMAI creator-refresh SSE stream. Keeps the shared
// secret off the browser AND scopes the scrape to the client's OWN creators:
//   * authorize via the session (getActiveClient) — never trust the raw id;
//   * intersect the requested ids with the client's owned creator ids, so a
//     legacy/global or another client's creator is never re-scraped/mutated;
//   * NEVER forward an empty id list to SMAI — SMAI treats `ids: []` as
//     "refresh ALL creators" (a global scrape). If the client owns none, we
//     short-circuit with a single `complete` event.
//
// GET (not POST) so the browser can consume it with EventSource. Query:
//   ?clientId=<active client>&ids=<comma-separated creator ids, or empty = all mine>

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

function sseComplete(): Response {
  return new Response(`data: ${JSON.stringify({ type: "complete" })}\n\n`, {
    headers: SSE_HEADERS,
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId") ?? "";
  const idsParam = url.searchParams.get("ids") ?? "";

  const ctx = await getActiveClient(clientId || null);
  if (!ctx || ctx.activeClientId !== clientId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const owned = await ownedCreatorIds(clientId);
  const requested = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  // Empty request = "refresh all mine"; otherwise only the requested ids I own.
  const ids = requested.length === 0 ? [...owned] : requested.filter((id) => owned.has(id));

  // Never send [] to SMAI (that means "all creators" on their side).
  if (ids.length === 0) return sseComplete();

  const upstream = await refreshCreatorsStream(ids);
  if (!upstream.ok || !upstream.body) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", error: `SMAI refresh failed (${upstream.status}).` })}\n\ndata: ${JSON.stringify({ type: "complete" })}\n\n`,
      { headers: SSE_HEADERS }
    );
  }
  return new Response(upstream.body, { status: 200, headers: SSE_HEADERS });
}
