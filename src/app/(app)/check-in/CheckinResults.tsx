"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { PhoneCall, Banknote, Users, Clapperboard, Sparkles, Pencil } from "lucide-react";
import PeriodToggle from "@/components/PeriodToggle";
import {
  metricsForPeriod,
  fmtMoney,
  fmtNum,
  type Period,
} from "@/lib/dashboard";
import {
  SECTIONS,
  fieldsFor,
  weekLabel,
  STUCK_OPTIONS,
  type CheckinField,
  type CheckinRow,
  type CheckinAnalysisRow,
} from "@/lib/checkin";

const GOLD = "#B4893C";
const INK_SOFT = "#6B655C";
const LINE = "#E9E3D7";

export default function CheckinResults({
  clientFirstName,
  isAdmin,
  rows,
  latestAnalysis,
  currentWeek,
  onEditThisWeek,
}: {
  clientFirstName: string;
  isAdmin: boolean;
  rows: CheckinRow[];
  latestAnalysis: CheckinAnalysisRow | null;
  currentWeek: string;
  onEditThisWeek: () => void;
}) {
  const [period, setPeriod] = useState<Period>("weekly");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const now = new Date();
  const totals = useMemo(() => metricsForPeriod(rows, period, now), [rows, period]);

  const ascending = useMemo(
    () => [...rows].sort((a, b) => (a.week_starting < b.week_starting ? -1 : 1)),
    [rows]
  );

  const mindsetData = useMemo(
    () =>
      ascending.map((r) => ({
        week: weekLabel(r.week_starting).replace(/ \d{4}$/, ""),
        mindset: r.mindset_score,
      })),
    [ascending]
  );

  const stuckData = useMemo(() => {
    const counts = new Map<string, number>(STUCK_OPTIONS.map((o) => [o, 0]));
    for (const r of rows) {
      for (const a of r.stuck_areas ?? []) {
        if (counts.has(a)) counts.set(a, (counts.get(a) ?? 0) + 1);
      }
    }
    return STUCK_OPTIONS.map((o) => ({ area: o, count: counts.get(o) ?? 0 })).filter((d) => d.count > 0);
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="card max-w-2xl">
        <h2 className="font-display text-lg text-ink">No check-ins yet</h2>
        <p className="mt-2 text-sm text-ink-soft">
          {isAdmin
            ? `${clientFirstName} hasn't submitted a check-in yet. Once they do, their metrics and trends show up here.`
            : "Submit your first weekly check-in and your numbers, trends, and Rumi's read on your week will build up here."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metric cards + period toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg text-ink">The numbers</h2>
        <PeriodToggle value={period} onChange={setPeriod} />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard icon={<PhoneCall size={16} strokeWidth={1.75} />} label="Calls booked" value={fmtNum(totals.callsBooked)} />
        <MetricCard icon={<Banknote size={16} strokeWidth={1.75} />} label="Cash collected" value={fmtMoney(totals.cashCollected)} />
        <MetricCard icon={<Users size={16} strokeWidth={1.75} />} label="Followers gained" value={fmtNum(totals.followersGained)} />
        <MetricCard icon={<Clapperboard size={16} strokeWidth={1.75} />} label="Content posted" value={fmtNum(totals.contentPosted)} />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <p className="eyebrow mb-1">Mindset trend</p>
          <p className="mb-4 text-xs text-ink-soft">How you&apos;ve actually felt, week to week (1-10).</p>
          <div className="h-56">
            {mounted && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mindsetData} margin={{ top: 5, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke={LINE} vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: INK_SOFT }} tickLine={false} axisLine={{ stroke: LINE }} />
                  <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 11, fill: INK_SOFT }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: `1px solid ${LINE}`, fontSize: 12 }}
                    labelStyle={{ color: INK_SOFT }}
                    formatter={(v) => [v ?? "—", "Mindset"]}
                  />
                  <Line type="monotone" dataKey="mindset" stroke={GOLD} strokeWidth={2} dot={{ r: 3, fill: GOLD }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <p className="eyebrow mb-1">Where you get stuck</p>
          <p className="mb-4 text-xs text-ink-soft">How often each area has come up across your check-ins.</p>
          <div className="h-56">
            {mounted && stuckData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stuckData} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={LINE} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: INK_SOFT }} tickLine={false} axisLine={{ stroke: LINE }} />
                  <YAxis type="category" dataKey="area" width={140} tick={{ fontSize: 10, fill: INK_SOFT }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: `1px solid ${LINE}`, fontSize: 12 }} cursor={{ fill: "rgba(180,137,60,0.06)" }} />
                  <Bar dataKey="count" fill={GOLD} radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              mounted && (
                <div className="flex h-full items-center justify-center text-center text-sm text-ink-soft">
                  No stuck-areas selected yet.
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Rumi's analysis */}
      <AnalysisCard analysis={latestAnalysis} clientFirstName={clientFirstName} isAdmin={isAdmin} />

      {/* Week browser */}
      <WeekBrowser rows={rows} currentWeek={currentWeek} onEditThisWeek={onEditThisWeek} />
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card p-4">
      <span className="inline-flex size-8 items-center justify-center rounded-lg bg-gold-tint text-gold-deep">{icon}</span>
      <p className="mt-3 font-display text-2xl tabular-nums text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink-soft">{label}</p>
    </div>
  );
}

function AnalysisCard({
  analysis,
  clientFirstName,
  isAdmin,
}: {
  analysis: CheckinAnalysisRow | null;
  clientFirstName: string;
  isAdmin: boolean;
}) {
  const sections: { label: string; value: string | null; tone: "flag" | "normal" }[] = analysis
    ? (
        [
          { label: "Red flags", value: analysis.red_flags, tone: "flag" },
          { label: "Plateaus", value: analysis.plateaus, tone: "normal" },
          { label: "Themes", value: analysis.themes, tone: "normal" },
          { label: "Recommendations", value: analysis.recommendations, tone: "normal" },
        ] as { label: string; value: string | null; tone: "flag" | "normal" }[]
      ).filter((s) => s.value && s.value.trim().length > 0)
    : [];

  return (
    <div className="card">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-8 items-center justify-center rounded-lg bg-gold-tint text-gold-deep">
          <Sparkles size={16} strokeWidth={1.75} />
        </span>
        <div>
          <h2 className="font-display text-lg text-ink">Rumi&apos;s read on the week</h2>
          {analysis && (
            <p className="text-xs text-ink-soft">Week of {weekLabel(analysis.week_starting)}</p>
          )}
        </div>
      </div>

      {sections.length === 0 ? (
        <p className="mt-4 rounded-lg border border-line bg-cream/50 px-4 py-6 text-center text-sm text-ink-soft">
          No analysis yet. Rumi reviews {isAdmin ? `${clientFirstName}'s` : "your"} check-ins each week and surfaces
          red flags, plateaus, themes, and recommendations here.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {sections.map((s) => (
            <div key={s.label}>
              <p className={`eyebrow mb-1 ${s.tone === "flag" ? "text-red-600" : ""}`}>{s.label}</p>
              <p className="whitespace-pre-wrap text-sm text-ink">{s.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WeekBrowser({
  rows,
  currentWeek,
  onEditThisWeek,
}: {
  rows: CheckinRow[];
  currentWeek: string;
  onEditThisWeek: () => void;
}) {
  const [selected, setSelected] = useState(rows[0]?.week_starting.slice(0, 10) ?? currentWeek);
  const row = rows.find((r) => r.week_starting.slice(0, 10) === selected) ?? null;
  const isThisWeek = selected === currentWeek;

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg text-ink">Past weeks</h2>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="cursor-pointer rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
        >
          {rows.map((r) => (
            <option key={r.id} value={r.week_starting.slice(0, 10)}>
              {weekLabel(r.week_starting)}
              {r.week_starting.slice(0, 10) === currentWeek ? " (this week)" : ""}
            </option>
          ))}
        </select>
      </div>

      {isThisWeek && (
        <button onClick={onEditThisWeek} className="btn-ghost mt-4 px-3 py-1.5 text-xs">
          <Pencil size={13} strokeWidth={1.75} /> Edit this week
        </button>
      )}

      {row && (
        <div className="mt-5 space-y-6">
          {SECTIONS.map((section) => (
            <div key={section}>
              <p className="eyebrow mb-2.5">{section}</p>
              <dl className="space-y-3">
                {fieldsFor(section).map((f) => (
                  <div key={f.column}>
                    <dt className="text-xs font-medium text-ink-soft">{f.label}</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{displayValue(f, row)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function displayValue(field: CheckinField, row: CheckinRow): string {
  const raw = (row as unknown as Record<string, unknown>)[field.column];
  if (field.kind === "slider") return raw === null || raw === undefined ? "—" : `${raw} / 10`;
  if (field.kind === "money") return raw === null || raw === undefined ? "—" : fmtMoney(Number(raw));
  if (field.kind === "int") {
    const base = raw === null || raw === undefined ? "—" : fmtNum(Number(raw));
    if (field.note) {
      const note = (row as unknown as Record<string, unknown>)[`${field.column}_note`];
      if (note && String(note).trim()) return `${base}\n${String(note).trim()}`;
    }
    return base;
  }
  if (field.kind === "multiselect") {
    const arr = Array.isArray(raw) ? (raw as string[]) : [];
    return arr.length > 0 ? arr.join(", ") : "—";
  }
  const s = raw === null || raw === undefined ? "" : String(raw).trim();
  return s.length > 0 ? s : "—";
}
