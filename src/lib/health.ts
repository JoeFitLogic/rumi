// RAG health scoring — the single source of truth for the weekly health
// signals shown to BOTH the client (dashboard "This Week" strip) and the coach
// (/admin table + /admin/clients/[id]).
//
// Everything here is a pure function over data the caller has already fetched,
// so the client view and the admin view can never drift: change a threshold in
// THRESHOLDS below and every surface moves with it.
//
// WHERE EACH METRIC COMES FROM
//   calls / videos / followers → the client's most recent checkin_responses row
//   check-in recency           → that row's submission time (created_at)
//   scripts                    → `scripts` rows created inside that SAME week
//
// All four metrics describe one window: the week of the client's most recent
// check-in ([week_starting, week_starting + 7 days)). The strip is a single
// coherent "this is your week" snapshot, so the script count is NOT a live
// calendar-week tally — it is scoped to the same week the rest of the numbers
// report on. weekWindow() below is the one place that window is defined.
//
// WHY `scripts` AND NOT `content_ideas`
//   content_ideas is the Content Bank, bulk-populated by the research
//   synthesiser (saveIdeas inserts a whole batch in one go), so a single
//   research run would turn the metric green without the client doing a week's
//   work. `scripts` is one row per script the client actually generated in
//   Script Studio, keyed on user_id like the check-in data. It measures effort;
//   content_ideas measures inventory.

/** Red / amber / green, plus "neutral" for a metric that can't be scored. */
export type Rag = "green" | "amber" | "red" | "neutral";

export type HealthMetricKey = "calls" | "recency" | "videos" | "scripts";

export interface HealthMetric {
  key: HealthMetricKey;
  /** Full label for the client strip and the admin detail page. */
  label: string;
  /** Two/three-char label for the compact admin table indicator. */
  short: string;
  rag: Rag;
  /** Display value, e.g. "82%", "3", "5d ago". */
  value: string;
  /**
   * Plain-language goal, shown next to the value on the client strip so the
   * colour comes with an action rather than a verdict.
   */
  target: string;
}

// ── Thresholds — the only place these numbers live ─────────────────────────
export const THRESHOLDS = {
  /** calls_attended / calls_offered, as a percentage. */
  callsAttendedPct: { green: 85, amber: 60 },
  /** Whole days since the last check-in submission. Lower is better. */
  checkinRecencyDays: { green: 3, amber: 14 },
  /** content_volume from the latest check-in. */
  videosPosted: { green: 6, amber: 4 },
  /** scripts rows created in the current week. */
  scriptsCreated: { green: 6, amber: 4 },
} as const;

/** The checkin_responses columns health scoring reads. */
export interface HealthCheckinRow {
  week_starting: string;
  created_at: string;
  calls_attended: number | null;
  calls_offered: number | null;
  content_volume: number | null;
  followers_gained: number | null;
}

export interface HealthInput {
  /** Most recent checkin_responses row for the client, or null if none. */
  checkin: HealthCheckinRow | null;
  /** Count of `scripts` rows created inside the check-in's week window. */
  scriptsThisWeek: number;
  now: Date;
}

export interface ClientHealthSignals {
  /** The four scored metrics, always in a stable order. */
  metrics: HealthMetric[];
  /** Tracking only — no RAG colour by design. Null when there's no check-in. */
  followersGained: number | null;
  /** False when the client has never submitted a check-in. */
  hasCheckin: boolean;
  /**
   * `week_starting` of the check-in every metric describes, so surfaces can
   * label the window. Null when there's no check-in.
   */
  weekStarting: string | null;
}

// ── helpers ────────────────────────────────────────────────────────────────

/** "higher is better" banding. */
function bandHigh(value: number, green: number, amber: number): Rag {
  if (value >= green) return "green";
  if (value >= amber) return "amber";
  return "red";
}

/** "lower is better" banding (used for recency). */
function bandLow(value: number, green: number, amber: number): Rag {
  if (value <= green) return "green";
  if (value <= amber) return "amber";
  return "red";
}

/** Whole days between an ISO timestamp and `now`; null if unparseable. */
function daysBetween(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const ms = now.getTime() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/**
 * Monday 00:00 local time for the week containing `now`. Only used as the
 * fallback window when a client has no check-in to anchor to.
 */
export function startOfWeek(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // getDay(): 0 = Sunday. Shift so Monday is the first day.
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

/** Parse a YYYY-MM-DD date as local midnight (avoids UTC boundary drift). */
function parseWeekStart(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export interface WeekWindow {
  /** Inclusive lower bound. */
  start: Date;
  /** Exclusive upper bound (start + 7 days). */
  end: Date;
}

/**
 * The week every metric on the strip describes: the week of the client's most
 * recent check-in. Falls back to the current Monday-based week only when there
 * is no check-in to anchor to (in which case the strip shows its empty state
 * anyway).
 */
export function weekWindow(
  checkin: HealthCheckinRow | null,
  now: Date
): WeekWindow {
  const start = checkin ? parseWeekStart(checkin.week_starting) : startOfWeek(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

/** A `scripts` row, reduced to what health scoring needs. */
export interface HealthScriptRow {
  user_id?: string | null;
  created_at: string;
}

/** Count script rows falling inside a week window. */
export function countScriptsInWindow(
  rows: HealthScriptRow[],
  w: WeekWindow
): number {
  const from = w.start.getTime();
  const to = w.end.getTime();
  let n = 0;
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    if (!Number.isNaN(t) && t >= from && t < to) n++;
  }
  return n;
}

// ── the four scored metrics ────────────────────────────────────────────────

/**
 * Calls attended as a share of calls offered.
 *
 * A week with no calls offered is NOT a failure — there was nothing to attend.
 * It scores "neutral" so an empty diary never shows red.
 */
export function callsMetric(row: HealthCheckinRow | null): HealthMetric {
  const base = {
    key: "calls" as const,
    label: "Calls attended",
    short: "Calls",
    target: `aim for ${THRESHOLDS.callsAttendedPct.green}%+`,
  };

  const offered = row?.calls_offered ?? 0;
  if (!row || offered <= 0) {
    return {
      ...base,
      rag: "neutral",
      value: "—",
      target: "no calls offered this week",
    };
  }

  const attended = row.calls_attended ?? 0;
  const pct = Math.round((attended / offered) * 100);
  return {
    ...base,
    rag: bandHigh(pct, THRESHOLDS.callsAttendedPct.green, THRESHOLDS.callsAttendedPct.amber),
    value: `${pct}%`,
  };
}

/** Days since the most recent check-in submission. */
export function recencyMetric(
  row: HealthCheckinRow | null,
  now: Date
): HealthMetric {
  const base = {
    key: "recency" as const,
    label: "Last check-in",
    short: "Check-in",
    target: "check in every week",
  };

  const days = daysBetween(row?.created_at ?? null, now);
  if (days === null) {
    return { ...base, rag: "red", value: "Never", target: "start your first check-in" };
  }

  const value = days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days}d ago`;
  return {
    ...base,
    rag: bandLow(days, THRESHOLDS.checkinRecencyDays.green, THRESHOLDS.checkinRecencyDays.amber),
    value,
  };
}

/** Videos posted this week (content_volume). */
export function videosMetric(row: HealthCheckinRow | null): HealthMetric {
  const posted = row?.content_volume ?? 0;
  return {
    key: "videos",
    label: "Videos posted",
    short: "Videos",
    rag: bandHigh(posted, THRESHOLDS.videosPosted.green, THRESHOLDS.videosPosted.amber),
    value: String(posted),
    target: `aim for ${THRESHOLDS.videosPosted.green}+`,
  };
}

/** Scripts created this week in Script Studio. */
export function scriptsMetric(count: number): HealthMetric {
  return {
    key: "scripts",
    label: "Scripts written",
    short: "Scripts",
    rag: bandHigh(count, THRESHOLDS.scriptsCreated.green, THRESHOLDS.scriptsCreated.amber),
    value: String(count),
    target: `aim for ${THRESHOLDS.scriptsCreated.green}+`,
  };
}

/**
 * The whole picture for one client. There is deliberately NO composite score —
 * four independent signals, each with its own colour, so a single weak week in
 * one area never hides behind a good average.
 */
export function clientHealth(input: HealthInput): ClientHealthSignals {
  const { checkin, scriptsThisWeek, now } = input;
  return {
    metrics: [
      callsMetric(checkin),
      recencyMetric(checkin, now),
      videosMetric(checkin),
      scriptsMetric(scriptsThisWeek),
    ],
    followersGained: checkin ? checkin.followers_gained ?? 0 : null,
    hasCheckin: checkin !== null,
    weekStarting: checkin?.week_starting ?? null,
  };
}

/**
 * Health signals for many clients at once — the admin table's entry point.
 *
 * Takes the flat result sets straight from Supabase (all check-in rows, all
 * scripts rows created this week) and returns a plain object keyed by client
 * id, so it can be passed across the server/client component boundary.
 */
export function healthByClient(
  clientIds: string[],
  checkinRows: (HealthCheckinRow & { user_id: string })[],
  scriptRows: HealthScriptRow[],
  now: Date
): Record<string, ClientHealthSignals> {
  const checkinsByUser = new Map<string, (HealthCheckinRow & { user_id: string })[]>();
  for (const r of checkinRows) {
    const list = checkinsByUser.get(r.user_id);
    if (list) list.push(r);
    else checkinsByUser.set(r.user_id, [r]);
  }

  const scriptsByUser = new Map<string, HealthScriptRow[]>();
  for (const r of scriptRows) {
    if (!r.user_id) continue;
    const list = scriptsByUser.get(r.user_id);
    if (list) list.push(r);
    else scriptsByUser.set(r.user_id, [r]);
  }

  const out: Record<string, ClientHealthSignals> = {};
  for (const id of clientIds) {
    // Each client's window is their OWN check-in week, so a client who checked
    // in late is still scored against the week they reported on.
    const checkin = latestCheckin(checkinsByUser.get(id) ?? []);
    out[id] = clientHealth({
      checkin,
      scriptsThisWeek: countScriptsInWindow(
        scriptsByUser.get(id) ?? [],
        weekWindow(checkin, now)
      ),
      now,
    });
  }
  return out;
}

/**
 * Earliest window start across every client — the lower bound for the admin
 * page's single scripts query, so one fetch covers every client's own week.
 */
export function earliestWindowStart(
  checkinRows: (HealthCheckinRow & { user_id: string })[],
  clientIds: string[],
  now: Date
): Date {
  const byUser = new Map<string, (HealthCheckinRow & { user_id: string })[]>();
  for (const r of checkinRows) {
    const list = byUser.get(r.user_id);
    if (list) list.push(r);
    else byUser.set(r.user_id, [r]);
  }
  let earliest = startOfWeek(now);
  for (const id of clientIds) {
    const { start } = weekWindow(latestCheckin(byUser.get(id) ?? []), now);
    if (start < earliest) earliest = start;
  }
  return earliest;
}

/** The row with the most recent week_starting, or null. */
export function latestCheckin<T extends { week_starting: string }>(
  rows: T[]
): T | null {
  if (rows.length === 0) return null;
  return rows.reduce((m, r) => (r.week_starting > m.week_starting ? r : m));
}

// ── presentation tokens ────────────────────────────────────────────────────
// Kept here (not in the components) so client and admin render identical
// colours for identical states.

export const RAG_DOT: Record<Rag, string> = {
  green: "bg-rag-green",
  amber: "bg-rag-amber",
  red: "bg-rag-red",
  neutral: "bg-ink-soft/30",
};

export const RAG_CHIP: Record<Rag, string> = {
  green: "bg-rag-green/10 text-rag-green-deep",
  amber: "bg-rag-amber/10 text-rag-amber-deep",
  red: "bg-rag-red/10 text-rag-red-deep",
  neutral: "bg-cream text-ink-soft",
};

/** Screen-reader / tooltip wording for a colour. */
export const RAG_LABEL: Record<Rag, string> = {
  green: "On track",
  amber: "Slipping",
  red: "Needs attention",
  neutral: "Not scored",
};
