import { RAG_CHIP, RAG_DOT, RAG_LABEL, type HealthMetric } from "@/lib/health";

/**
 * Compact RAG indicators for one client, sized for an admin table row —
 * four dots Niamh can scan down a 60-client list to spot who's slipping.
 * Each dot carries a title so hovering names the metric and its state.
 *
 * No "use client" on purpose: pure presentation, so it renders inside both the
 * server-rendered detail page and the client-rendered health table.
 */
export function RagDots({ metrics }: { metrics: HealthMetric[] }) {
  return (
    <div className="flex items-center gap-1.5">
      {metrics.map((m) => (
        <span
          key={m.key}
          title={`${m.label}: ${m.value} (${RAG_LABEL[m.rag]})`}
          className={`size-2.5 rounded-full ${RAG_DOT[m.rag]}`}
        >
          <span className="sr-only">
            {m.label}: {m.value} — {RAG_LABEL[m.rag]}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * The full breakdown — label, value and target per metric — for the admin
 * client detail page. Same numbers as the client sees on their own dashboard.
 */
export function RagBreakdown({ metrics }: { metrics: HealthMetric[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {metrics.map((m) => (
        <div key={m.key} className="rounded-md border border-line px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-ink-soft">
            {m.label}
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-xl tabular-nums text-ink">
              {m.value}
            </span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${RAG_CHIP[m.rag]}`}
            >
              {RAG_LABEL[m.rag]}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-ink-soft">{m.target}</p>
        </div>
      ))}
    </div>
  );
}
