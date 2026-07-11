// Shared check-in metric maths + formatting for the Dashboard and Client
// Health pages. Metrics come from checkin_responses; all figures are derived
// here so the two pages stay consistent.

export type Period = "weekly" | "monthly" | "all";

export const PERIODS: { value: Period; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "This month" },
  { value: "all", label: "All time" },
];

export const PERIOD_HINT: Record<Period, string> = {
  weekly: "Latest check-in",
  monthly: "This month",
  all: "All time",
};

/** The checkin_responses columns the dashboards read. */
export interface CheckinMetricRow {
  week_starting: string;
  created_at: string;
  calls_booked: number | null;
  cash_collected: number | null;
  followers_gained: number | null;
  content_volume: number | null;
}

export interface CheckinMetricRowWithUser extends CheckinMetricRow {
  user_id: string;
}

export interface MetricTotals {
  callsBooked: number;
  cashCollected: number;
  followersGained: number;
  contentPosted: number;
}

export type PeriodMetrics = Record<Period, MetricTotals>;

const ZERO: MetricTotals = {
  callsBooked: 0,
  cashCollected: 0,
  followersGained: 0,
  contentPosted: 0,
};

/** Parse a YYYY-MM-DD date as local midnight (avoids UTC month-boundary drift). */
function parseDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function add(a: MetricTotals, r: CheckinMetricRow): MetricTotals {
  return {
    callsBooked: a.callsBooked + (r.calls_booked ?? 0),
    cashCollected: a.cashCollected + (Number(r.cash_collected) || 0),
    followersGained: a.followersGained + (r.followers_gained ?? 0),
    contentPosted: a.contentPosted + (r.content_volume ?? 0),
  };
}

/** The row with the most recent week_starting, or null when there are none. */
export function latestWeek<T extends CheckinMetricRow>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return rows.reduce((m, r) => (r.week_starting > m.week_starting ? r : m));
}

/**
 * weekly  → the single latest week's values
 * monthly → sum of rows whose week_starting falls in the current calendar month
 * all     → sum of every row
 */
export function metricsForPeriod(
  rows: CheckinMetricRow[],
  period: Period,
  now: Date
): MetricTotals {
  if (period === "weekly") {
    const l = latestWeek(rows);
    return l ? add(ZERO, l) : ZERO;
  }
  if (period === "monthly") {
    const y = now.getFullYear();
    const m = now.getMonth();
    return rows
      .filter((r) => {
        const d = parseDate(r.week_starting);
        return d.getFullYear() === y && d.getMonth() === m;
      })
      .reduce(add, ZERO);
  }
  return rows.reduce(add, ZERO);
}

export function allPeriods(rows: CheckinMetricRow[], now: Date): PeriodMetrics {
  return {
    weekly: metricsForPeriod(rows, "weekly", now),
    monthly: metricsForPeriod(rows, "monthly", now),
    all: metricsForPeriod(rows, "all", now),
  };
}

export interface ClientHealth {
  id: string;
  name: string | null;
  email: string | null;
  /** ISO timestamp of the most recent check-in submission, or null. */
  lastCheckin: string | null;
  periods: PeriodMetrics;
}

/** Group check-in rows by client and compute each client's period metrics. */
export function aggregateClients(
  clients: { id: string; name: string | null; email: string | null }[],
  rows: CheckinMetricRowWithUser[],
  now: Date
): ClientHealth[] {
  const byUser = new Map<string, CheckinMetricRowWithUser[]>();
  for (const r of rows) {
    const list = byUser.get(r.user_id);
    if (list) list.push(r);
    else byUser.set(r.user_id, [r]);
  }
  return clients.map((c) => {
    const rs = byUser.get(c.id) ?? [];
    const lastCheckin = rs.reduce<string | null>(
      (m, r) => (m === null || r.created_at > m ? r.created_at : m),
      null
    );
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      lastCheckin,
      periods: allPeriods(rs, now),
    };
  });
}

/** Whole days since a check-in; null when there's never been one. */
export function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const ms = now.getTime() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export const STALE_DAYS = 14;

export function isStale(iso: string | null, now: Date): boolean {
  const d = daysSince(iso, now);
  return d === null || d >= STALE_DAYS;
}

// ── formatting ─────────────────────────────────────────────────────────
const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export function fmtMoney(n: number): string {
  return gbp.format(n);
}

export function fmtNum(n: number): string {
  return n.toLocaleString("en-GB");
}

/** e.g. "7 Jun 2026" */
export function fmtDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Countdown to a strategy's auto-release deadline, e.g. "auto-releases in 2d",
 * "auto-releases today", or "auto-releasing now" once the deadline has passed.
 */
export function releaseCountdown(deadlineIso: string | null, now: Date): string {
  if (!deadlineIso) return "no deadline set";
  const ms = new Date(deadlineIso).getTime() - now.getTime();
  if (Number.isNaN(ms)) return "no deadline set";
  if (ms <= 0) return "auto-releasing now";
  if (ms < 86_400_000) return `auto-releases in ${Math.max(1, Math.ceil(ms / 3_600_000))}h`;
  return `auto-releases in ${Math.ceil(ms / 86_400_000)}d`;
}

/** Short relative label: Today / Yesterday / 5d ago / 3w ago / Never. */
export function relativeLabel(iso: string | null, now: Date): string {
  const d = daysSince(iso, now);
  if (d === null) return "Never";
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 14) return `${d}d ago`;
  if (d < 60) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}
