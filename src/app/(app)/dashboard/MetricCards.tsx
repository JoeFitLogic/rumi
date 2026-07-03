"use client";

import { useState } from "react";
import PeriodToggle from "@/components/PeriodToggle";
import {
  fmtMoney,
  fmtNum,
  PERIOD_HINT,
  type Period,
  type PeriodMetrics,
} from "@/lib/dashboard";

export default function MetricCards({
  periods,
  hasData,
}: {
  periods: PeriodMetrics;
  hasData: boolean;
}) {
  const [period, setPeriod] = useState<Period>("weekly");
  const m = periods[period];
  const hint = PERIOD_HINT[period];

  const cards = [
    { label: "Calls booked", value: hasData ? fmtNum(m.callsBooked) : "—" },
    { label: "Cash collected", value: hasData ? fmtMoney(m.cashCollected) : "—" },
    { label: "Followers gained", value: hasData ? fmtNum(m.followersGained) : "—" },
    { label: "Content posted", value: hasData ? fmtNum(m.contentPosted) : "—" },
  ];

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <p className="eyebrow">Your numbers</p>
        <PeriodToggle value={period} onChange={setPeriod} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <p className="text-xs uppercase tracking-wide text-ink-soft">
              {c.label}
            </p>
            <p className="mt-2 font-display text-3xl tabular-nums text-ink">
              {c.value}
            </p>
            <p className="mt-1 text-xs text-ink-soft">{hint}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
