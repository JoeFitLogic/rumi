import { fmtDate, fmtNum } from "@/lib/dashboard";
import {
  RAG_DOT,
  RAG_LABEL,
  type ClientHealthSignals,
  type HealthMetric,
} from "@/lib/health";

/**
 * Client-facing "This Week" health strip.
 *
 * Every metric shows its value, its colour, AND the target right next to it —
 * the colour is there to motivate, the target is there to say what to do about
 * it. Deliberately no overall/composite score: four separate signals, so a
 * quiet week in one area is a specific, fixable thing rather than a grade.
 */
export default function HealthStrip({
  health,
}: {
  health: ClientHealthSignals;
}) {
  if (!health.hasCheckin) {
    return (
      <section className="card mb-6">
        <p className="eyebrow mb-2">This week</p>
        <p className="max-w-md text-sm text-ink-soft">
          Your weekly health signals appear here once you complete your first
          check-in.
        </p>
      </section>
    );
  }

  return (
    <section className="card mb-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-2">
          <p className="eyebrow">This week</p>
          {health.weekStarting && (
            <span className="text-xs text-ink-soft">
              week of {fmtDate(health.weekStarting)}
            </span>
          )}
        </div>
        <p className="text-xs text-ink-soft">
          Followers gained{" "}
          <span className="font-medium tabular-nums text-ink">
            {fmtNum(health.followersGained ?? 0)}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
        {health.metrics.map((m) => (
          <MetricRow key={m.key} metric={m} />
        ))}
      </div>
    </section>
  );
}

function MetricRow({ metric }: { metric: HealthMetric }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span
          className={`size-2 shrink-0 rounded-full ${RAG_DOT[metric.rag]}`}
          aria-hidden="true"
        />
        <p className="text-xs uppercase tracking-wide text-ink-soft">
          {metric.label}
        </p>
      </div>
      <p className="mt-1.5 font-display text-2xl tabular-nums text-ink">
        {metric.value}
        <span className="sr-only"> — {RAG_LABEL[metric.rag]}</span>
      </p>
      <p className="mt-0.5 text-xs text-ink-soft">{metric.target}</p>
    </div>
  );
}
