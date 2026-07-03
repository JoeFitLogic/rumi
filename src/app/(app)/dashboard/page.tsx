"use client";

import PageHeader from "@/components/PageHeader";
import { useClientContext } from "@/hooks/useClientContext";

const PLACEHOLDER_METRICS = [
  { label: "Calls booked", hint: "This week" },
  { label: "Cash collected", hint: "This month" },
  { label: "Followers gained", hint: "This week" },
  { label: "Content posted", hint: "This week" },
];

export default function DashboardPage() {
  const { activeClient } = useClientContext();
  const firstName = (activeClient.name ?? "there").split(" ")[0];

  return (
    <div>
      <PageHeader
        eyebrow="Dashboard"
        title={`Welcome back, ${firstName}`}
        description="Your key numbers and recommendations, pulled from your weekly check-ins."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PLACEHOLDER_METRICS.map((m) => (
          <div key={m.label} className="card">
            <p className="text-xs uppercase tracking-wide text-ink-soft">
              {m.label}
            </p>
            <p className="mt-2 font-display text-3xl text-ink">—</p>
            <p className="mt-1 text-xs text-ink-soft">{m.hint}</p>
          </div>
        ))}
      </div>

      <div className="card mt-6">
        <p className="eyebrow mb-2">Recommendations</p>
        <p className="text-sm text-ink-soft">
          Recommendations will appear here once check-in data starts flowing.
          Complete your first weekly check-in to get started.
        </p>
      </div>
    </div>
  );
}
