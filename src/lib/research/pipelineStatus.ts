import type { PipelineRunStatus, PipelineProgress } from "./types";

// Trigger.dev run status — polled with the run's PUBLIC token (not the SMAI
// secret). SMAI's /api/pipeline mints `auth.createPublicToken({read:{runs:[id]}})`;
// that token reads exactly this run from the Trigger.dev API. This is how we show
// live progress without adding @trigger.dev/react-hooks or holding a Trigger key.
//
// Split out of smai.ts, which is server-only: the claim-pipeline-videos task
// polls the same run, and a Trigger build cannot resolve `server-only`. Nothing
// here is a secret — the public token is scoped to reading one run.
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
