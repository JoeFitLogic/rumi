import "server-only";

// Apify client for the Reddit scrape (Research Step 3).
//
// trudax "Reddit Scraper" actor FgJtjDwJCLhRH9saM. The old n8n workflow used
// run-sync-get-dataset-items (a blocking call that ties up the serverless
// function for the whole scrape). Here we use an ASYNC run + status polling so
// the server action returns immediately and the client polls for completion.
//
// BUG FIX (see reference/porting-notes.md §4): the old workflow computed the
// picked subreddits but never passed them to the actor — it only searched by
// keyword. This actor's input schema DOES support community targeting via
// `startUrls`, so we scrape the top posts of each picked subreddit directly.

const BASE = "https://api.apify.com/v2";
const ACTOR_ID = "FgJtjDwJCLhRH9saM";

function token(): string {
  const t = process.env.APIFY_API_TOKEN;
  if (!t) throw new Error("APIFY_API_TOKEN is not set.");
  return t;
}

export interface ApifyRun {
  id: string;
  status: string; // READY | RUNNING | SUCCEEDED | FAILED | TIMED-OUT | ABORTED
  defaultDatasetId: string;
}

/** Terminal Apify run statuses. */
export const TERMINAL_STATUSES = new Set([
  "SUCCEEDED",
  "FAILED",
  "TIMED-OUT",
  "ABORTED",
]);

/**
 * Proxy config for the actor. Residential proxies are best for Reddit (datacenter
 * IPs get blocked), but they require a paid Apify plan — and requesting a proxy
 * group the account doesn't have makes the run 403 *before it starts*. So the
 * group is env-driven, with an AUTO-proxy fallback (no group) that never 403s
 * regardless of plan:
 *   APIFY_PROXY_GROUPS="RESIDENTIAL"  → residential (set in prod once the Apify
 *                                       account actually has residential access)
 *   APIFY_PROXY_GROUPS unset / empty  → auto proxy (safe default, works on any plan)
 */
function proxyConfig(): { useApifyProxy: true; apifyProxyGroups?: string[] } {
  const groups = (process.env.APIFY_PROXY_GROUPS ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
  return groups.length > 0
    ? { useApifyProxy: true, apifyProxyGroups: groups }
    : { useApifyProxy: true };
}

/**
 * Build the actor input from the picked subreddits. We target the communities
 * directly (startUrls → each subreddit's top posts of the year) rather than a
 * keyword search, which is the fix for the old drop-the-subreddits bug.
 */
export function buildRedditInput(subreddits: string[]) {
  const clean = subreddits
    .map((s) => s.replace(/^\/?r\//i, "").trim())
    .filter(Boolean);
  return {
    startUrls: clean.map((s) => ({
      url: `https://www.reddit.com/r/${s}/top/?t=year`,
    })),
    skipComments: false,
    skipUserPosts: true,
    // startUrls ARE community (subreddit) pages — must NOT skip them.
    skipCommunity: false,
    searchPosts: true,
    searchComments: false,
    searchCommunities: false,
    searchUsers: false,
    maxItems: 15,
    maxPostCount: 15,
    maxComments: 3,
    sort: "top",
    time: "year",
    proxy: proxyConfig(),
  };
}

/** Kick off an async actor run. Returns immediately (does not wait). */
export async function startRedditRun(input: unknown): Promise<ApifyRun> {
  const res = await fetch(`${BASE}/acts/${ACTOR_ID}/runs?token=${token()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to start Reddit scrape (Apify ${res.status}).`);
  }
  const { data } = await res.json();
  return {
    id: data.id,
    status: data.status,
    defaultDatasetId: data.defaultDatasetId,
  };
}

/** Poll a single run's status. Cheap — no dataset fetch. */
export async function getRedditRun(runId: string): Promise<ApifyRun> {
  const res = await fetch(`${BASE}/actor-runs/${runId}?token=${token()}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to check scrape status (Apify ${res.status}).`);
  }
  const { data } = await res.json();
  return {
    id: data.id,
    status: data.status,
    defaultDatasetId: data.defaultDatasetId,
  };
}

/** Fetch the finished run's dataset items (posts + comments, mixed). */
export async function getDatasetItems(
  datasetId: string
): Promise<Record<string, unknown>[]> {
  const res = await fetch(
    `${BASE}/datasets/${datasetId}/items?token=${token()}&clean=true&format=json`,
    { cache: "no-store" }
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch scraped posts (Apify ${res.status}).`);
  }
  return (await res.json()) as Record<string, unknown>[];
}
