// Social analytics — shared types and formatting for the /social dashboard.
//
// ─────────────────────────────────────────────────────────────────────────
// INSTAGRAM DATA SOURCE — THE SEAM
//
// This is a LAYOUT SHELL. Instagram is not connected yet, so every value here
// is null and every section renders an empty state. Nothing fabricates a
// number: null means "we don't know", and the UI says so.
//
// When the Instagram integration lands, ONE function changes — loadSocialData()
// at the foot of this file. It currently returns emptySocialData(); replace its
// body with reads against `client_integrations` (is this client connected, and
// under which handle) and `instagram_posts` (the media rows to aggregate).
// Those tables were scoped earlier and are deliberately NOT queried yet.
//
// Every component below already accepts the populated shapes as props, so no
// component needs restructuring when real data arrives — the page goes from
// `connected: false` to `connected: true` and the sections fill in.
//
// The aggregation itself (30-day rollups, engagement rate, outlier multiplier)
// belongs here too, next to the types it produces, so the components stay
// presentational.
// ─────────────────────────────────────────────────────────────────────────

/** The eight scalar metrics in the strip. Null = no data yet. */
export interface SocialMetrics {
  followers: number | null;
  reach: number | null;
  newFollowers: number | null;
  engagement: number | null;
  engagementRate: number | null;
  videoViews: number | null;
  saves: number | null;
  shares: number | null;
}

/** One day's total engagement, for the engagement-over-time chart. */
export interface EngagementPoint {
  date: string;
  engagement: number;
}

/** One row of the top-performing-content table. */
export interface TopContentRow {
  id: string;
  caption: string;
  permalink: string | null;
  postedAt: string | null;
  engagementRate: number | null;
  views: number | null;
  likes: number | null;
  saves: number | null;
  shares: number | null;
}

/** Everything the /social page renders from. */
export interface SocialData {
  /** False until the client has completed the Instagram OAuth flow. */
  connected: boolean;
  /** @handle once connected, for the header. */
  handle: string | null;
  metrics: SocialMetrics;
  engagement: EngagementPoint[];
  topContent: TopContentRow[];
  /** e.g. "Last 30 days, as of 20 Aug 2026". */
  windowLabel: string;
}

export const EMPTY_METRICS: SocialMetrics = {
  followers: null,
  reach: null,
  newFollowers: null,
  engagement: null,
  engagementRate: null,
  videoViews: null,
  saves: null,
  shares: null,
};

/** The strip's cells, in the reference dashboard's order. */
export const METRIC_CELLS: {
  key: keyof SocialMetrics;
  label: string;
  /** Percentages render to one decimal; counts render whole. */
  kind: "count" | "percent";
  /** New followers reads better with an explicit +. */
  signed?: boolean;
}[] = [
  { key: "followers", label: "Followers", kind: "count" },
  { key: "reach", label: "Reach", kind: "count" },
  { key: "newFollowers", label: "New followers", kind: "count", signed: true },
  { key: "engagement", label: "Engagement", kind: "count" },
  { key: "engagementRate", label: "Engagement rate", kind: "percent" },
  { key: "videoViews", label: "Video views", kind: "count" },
  { key: "saves", label: "Saves", kind: "count" },
  { key: "shares", label: "Shares", kind: "count" },
];

/**
 * Format a metric for display. A null NEVER becomes 0 — it becomes an em dash,
 * so an unconnected account never looks like an account with no engagement.
 */
export function fmtMetric(
  value: number | null,
  kind: "count" | "percent",
  signed = false
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (kind === "percent") return `${value.toFixed(1)}%`;
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${Math.round(value).toLocaleString("en-GB")}`;
}

/** Whole-number formatter for table cells; "—" when unknown. */
export function fmtCell(value: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Math.round(value).toLocaleString("en-GB");
}

export function fmtRate(value: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

/** "Last 30 days, as of 20 Aug 2026" */
export function windowLabel(now: Date, days = 30): string {
  const asOf = now.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `Last ${days} days, as of ${asOf}`;
}

/** The shell's state: connected=false, every metric null, every list empty. */
export function emptySocialData(now: Date): SocialData {
  return {
    connected: false,
    handle: null,
    metrics: EMPTY_METRICS,
    engagement: [],
    topContent: [],
    windowLabel: windowLabel(now),
  };
}

/**
 * ⚡ INSTAGRAM WIRES IN HERE ⚡
 *
 * Currently returns the empty shell for every client. To connect Instagram:
 *   1. read `client_integrations` for this clientId → connected + handle
 *   2. read `instagram_posts` for the trailing 30 days
 *   3. aggregate into SocialMetrics / EngagementPoint[] / TopContentRow[]
 *
 * The signature already takes the clientId (always resolved through
 * getActiveClient() by the caller, so the admin switcher works) and `now`, so
 * nothing above this line has to change.
 */
export async function loadSocialData(
  _clientId: string,
  now: Date
): Promise<SocialData> {
  return emptySocialData(now);
}
