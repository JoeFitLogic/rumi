"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import PeriodToggle from "@/components/PeriodToggle";
import {
  fmtMoney,
  fmtNum,
  isStale,
  relativeLabel,
  type ClientHealth,
  type Period,
} from "@/lib/dashboard";

export default function ClientHealthTable({
  clients,
  nowMs,
}: {
  clients: ClientHealth[];
  nowMs: number;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("weekly");
  const now = new Date(nowMs);

  return (
    <section className="card p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
        <div>
          <p className="text-sm font-medium text-ink">Client overview</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            Numbers reflect the selected period. Rows flagged after 14 days with
            no check-in.
          </p>
        </div>
        <PeriodToggle value={period} onChange={setPeriod} />
      </div>

      {clients.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-ink-soft">
          No clients yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                {["Client", "Last check-in", "Calls booked", "Cash collected", "Followers gained", ""].map(
                  (h, i) => (
                    <th
                      key={h || i}
                      className={`px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-ink-soft ${
                        i >= 2 && i <= 4 ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const m = c.periods[period];
                const stale = isStale(c.lastCheckin, now);
                return (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/dashboard?as=${c.id}`)}
                    className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-cream"
                  >
                    <td className="px-5 py-3.5">
                      <span className="block font-medium text-ink">
                        {c.name ?? "Unnamed"}
                      </span>
                      {c.email && (
                        <span className="block text-xs text-ink-soft">
                          {c.email}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {stale ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-tint px-2.5 py-1 text-xs font-medium text-gold-deep">
                          <AlertTriangle size={12} strokeWidth={2} />
                          {relativeLabel(c.lastCheckin, now)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-xs text-ink-soft">
                          <span className="size-1.5 rounded-full bg-gold" />
                          {relativeLabel(c.lastCheckin, now)}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-ink">
                      {fmtNum(m.callsBooked)}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-ink">
                      {fmtMoney(m.cashCollected)}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-ink">
                      {fmtNum(m.followersGained)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/admin/clients/${c.id}`);
                        }}
                        className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-gold hover:text-gold-deep"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
