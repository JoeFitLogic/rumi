import { getActiveClient } from "@/lib/activeClient";
import { fetchPipelineRun } from "@/lib/research/smai";

// Poll a pipeline run's live status/progress. The run's PUBLIC token (returned by
// startPipeline, scoped read-only to that one run) is what reads Trigger.dev — no
// SMAI secret and no Trigger key are involved, so this is a thin authenticated
// pass-through. Session auth keeps it to logged-in users of the active client.
//
// GET ?clientId=<active client>&runId=<run>&token=<publicToken>

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId") ?? "";
  const runId = url.searchParams.get("runId") ?? "";
  const token = url.searchParams.get("token") ?? "";

  const ctx = await getActiveClient(clientId || null);
  if (!ctx || ctx.activeClientId !== clientId) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!runId || !token) {
    return Response.json({ error: "runId and token are required" }, { status: 400 });
  }

  try {
    const status = await fetchPipelineRun(runId, token);
    return Response.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to read run status" },
      { status: 502 }
    );
  }
}
