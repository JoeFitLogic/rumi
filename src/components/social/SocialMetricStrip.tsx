import { METRIC_CELLS, fmtMetric, type SocialMetrics } from "@/lib/social";

/**
 * Eight compact metric cells — the layout mirrors the reference dashboard's
 * strip, rebuilt in the Resonance palette.
 *
 * Values arrive already-formatted from fmtMetric(), which renders "—" for null,
 * so the shell shows a real empty state rather than a fabricated zero. When
 * Instagram lands, the same cells fill in with no structural change.
 */
export default function SocialMetricStrip({
  metrics,
  connected,
}: {
  metrics: SocialMetrics;
  connected: boolean;
}) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      {METRIC_CELLS.map((cell) => (
        <div key={cell.key} className="card p-4">
          <p className="text-[11px] uppercase tracking-wide text-ink-soft">
            {cell.label}
          </p>
          <p
            className={`mt-2 font-display text-2xl tabular-nums ${
              connected ? "text-ink" : "text-ink-soft/40"
            }`}
          >
            {fmtMetric(metrics[cell.key], cell.kind, cell.signed)}
          </p>
          {!connected && (
            <p className="mt-1 text-[10px] uppercase tracking-wide text-ink-soft/60">
              Not connected
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
