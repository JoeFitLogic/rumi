import type { Video, Creator } from "./types";

// Outlier scoring — how far a competitor video beat that creator's OWN baseline.
//
//   score = video.views / creator.avgViews30d
//
// `avgViews30d` is the honest denominator: Apify computes it across the
// creator's recent reels, so it reflects everything they posted, not just what
// landed on the board.
//
// The mean of a creator's board videos is deliberately NOT used as a fallback.
// SMAI's pipeline keeps only the topK most-viewed reels per creator per run, so
// the board already holds pre-selected top performers. Dividing a top performer
// by the average of top performers compresses everything toward 1.0 and hides
// exactly the outliers this is meant to surface. No baseline is more useful than
// a misleading one, so an unrefreshed creator says so instead.

/** Beyond this, a 30-day average is old enough to be worth a caveat. */
const STALE_AFTER_DAYS = 45;

/** A score of this or better is worth surfacing as real signal. */
export const OUTLIER_THRESHOLD = 2;

export interface Baseline {
  username: string;
  avgViews30d: number;
  /** Days since the stats were last scraped, or null if never. */
  ageDays: number | null;
  stale: boolean;
}

export type Outlier =
  /** Scored against a real baseline. */
  | { kind: "scored"; multiple: number; baseline: Baseline }
  /** The creator is tracked but has never had stats scraped. */
  | { kind: "no-baseline"; username: string }
  /** The video's creator has no `creators` row at all (repost, collab, guest). */
  | { kind: "unknown-creator"; username: string | null };

/**
 * Instagram usernames are matched case-insensitively.
 *
 * Videos carry `ownerUsername` straight from the scrape, which is lowercase;
 * `creators.username` carries whatever was typed into the form. Those already
 * disagree in production (`niamhcrichardson_` vs `Niamhcrichardson_`), and an
 * exact match silently drops every one of that creator's videos. Same pattern
 * competitor.ts:claimPipelineVideos uses for its block list.
 */
export function normalizeUsername(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/^@/, "").toLowerCase();
}

function ageInDays(lastScrapedAt: string | null): number | null {
  if (!lastScrapedAt || !lastScrapedAt.trim()) return null;
  const t = Date.parse(lastScrapedAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

/** Baselines keyed by normalized username. Creators with no usable average are
 *  still included, so a tracked-but-unrefreshed creator is distinguishable from
 *  one we have never heard of. */
export function buildBaselines(creators: Creator[] | null): Map<string, Baseline> {
  const map = new Map<string, Baseline>();
  for (const c of creators ?? []) {
    const key = normalizeUsername(c.username);
    if (!key) continue;
    const avg = typeof c.avgViews30d === "number" && c.avgViews30d > 0 ? c.avgViews30d : 0;
    const ageDays = ageInDays(c.lastScrapedAt);
    map.set(key, {
      username: c.username,
      avgViews30d: avg,
      ageDays,
      stale: avg > 0 && ageDays !== null && ageDays > STALE_AFTER_DAYS,
    });
  }
  return map;
}

/**
 * Score one video. Never divides by zero: an absent, zero or non-numeric
 * average is reported as "no baseline" rather than turned into a number.
 */
export function outlierFor(video: Video, baselines: Map<string, Baseline>): Outlier {
  const key = normalizeUsername(video.creator);
  const baseline = key ? baselines.get(key) : undefined;
  if (!baseline) return { kind: "unknown-creator", username: video.creator };
  if (baseline.avgViews30d <= 0) return { kind: "no-baseline", username: baseline.username };

  const views = typeof video.views === "number" && video.views > 0 ? video.views : 0;
  return {
    kind: "scored",
    multiple: views / baseline.avgViews30d,
    baseline,
  };
}

/** "5.2×" / "0.8×" — one decimal below 10, whole numbers above. */
export function formatMultiple(multiple: number): string {
  if (!Number.isFinite(multiple)) return "—";
  if (multiple >= 10) return `${Math.round(multiple)}×`;
  return `${multiple.toFixed(1)}×`;
}

/**
 * Videos ordered by how far they beat their creator's baseline.
 *
 * Unscored videos keep their existing relative order behind the scored ones,
 * rather than being dropped or sorted as if they were 0x — an unrefreshed
 * creator is missing information, not a poor performer.
 */
export function sortByOutlier(videos: Video[], baselines: Map<string, Baseline>): Video[] {
  return [...videos].sort((a, b) => {
    const oa = outlierFor(a, baselines);
    const ob = outlierFor(b, baselines);
    const sa = oa.kind === "scored" ? oa.multiple : -1;
    const sb = ob.kind === "scored" ? ob.multiple : -1;
    if (sa !== sb) return sb - sa;
    return (b.views ?? 0) - (a.views ?? 0);
  });
}

/** How many of these videos could be scored at all — drives the empty states. */
export function scoredCount(videos: Video[], baselines: Map<string, Baseline>): number {
  return videos.filter((v) => outlierFor(v, baselines).kind === "scored").length;
}
