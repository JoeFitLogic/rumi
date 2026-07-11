"use client";

import { useState } from "react";
import { ClipboardCheck, BarChart3 } from "lucide-react";
import type { CheckinRow, CheckinAnalysisRow } from "@/lib/checkin";
import CheckinForm from "./CheckinForm";
import CheckinResults from "./CheckinResults";

type Tab = "form" | "results";

export default function CheckIn({
  clientId,
  isAdmin,
  clientFirstName,
  currentWeek,
  currentWeekRow,
  allRows,
  latestAnalysis,
}: {
  clientId: string;
  isAdmin: boolean;
  clientFirstName: string;
  currentWeek: string;
  currentWeekRow: CheckinRow | null;
  allRows: CheckinRow[];
  latestAnalysis: CheckinAnalysisRow | null;
}) {
  const [tab, setTab] = useState<Tab>("form");
  const [rows, setRows] = useState<CheckinRow[]>(allRows);

  const existing = rows.find((r) => r.week_starting.slice(0, 10) === currentWeek) ?? currentWeekRow;

  function onSaved(row: CheckinRow) {
    setRows((prev) => {
      const without = prev.filter((r) => r.id !== row.id && r.week_starting.slice(0, 10) !== row.week_starting.slice(0, 10));
      return [row, ...without].sort((a, b) => (a.week_starting < b.week_starting ? 1 : -1));
    });
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Check-in views"
        className="mb-6 inline-flex items-center gap-0.5 rounded-lg border border-line bg-cream p-0.5"
      >
        <TabButton active={tab === "form"} onClick={() => setTab("form")} icon={<ClipboardCheck size={15} strokeWidth={1.75} />}>
          This week&apos;s form
        </TabButton>
        <TabButton active={tab === "results"} onClick={() => setTab("results")} icon={<BarChart3 size={15} strokeWidth={1.75} />}>
          Results
        </TabButton>
      </div>

      {tab === "form" ? (
        <CheckinForm
          clientId={clientId}
          currentWeek={currentWeek}
          existing={existing ?? null}
          onSaved={(row) => {
            onSaved(row);
            setTab("results");
          }}
        />
      ) : (
        <CheckinResults
          clientFirstName={clientFirstName}
          isAdmin={isAdmin}
          rows={rows}
          latestAnalysis={latestAnalysis}
          currentWeek={currentWeek}
          onEditThisWeek={() => setTab("form")}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
        active ? "bg-paper text-ink shadow-sm ring-1 ring-line" : "text-ink-soft hover:text-ink"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
