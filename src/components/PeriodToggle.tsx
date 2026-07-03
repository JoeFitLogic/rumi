"use client";

import { PERIODS, type Period } from "@/lib/dashboard";

/**
 * Segmented control for weekly / this-month / all-time. Rebuilt in the Rumi
 * design system — gold active pill on a cream track.
 */
export default function PeriodToggle({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Time period"
      className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-cream p-0.5"
    >
      {PERIODS.map((p) => {
        const active = p.value === value;
        return (
          <button
            key={p.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(p.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "bg-paper text-ink shadow-sm ring-1 ring-line"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
