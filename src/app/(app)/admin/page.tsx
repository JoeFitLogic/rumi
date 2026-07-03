import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { getActiveClient } from "@/lib/activeClient";
import { createClient } from "@/lib/supabase/server";
import {
  aggregateClients,
  isStale,
  daysSince,
  type CheckinMetricRowWithUser,
} from "@/lib/dashboard";
import ClientHealthTable from "./ClientHealthTable";

export default async function AdminPage() {
  const ctx = await getActiveClient();
  if (!ctx || ctx.viewer.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const [clientsRes, rowsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, name, email")
      .eq("role", "client")
      .order("name", { ascending: true }),
    supabase
      .from("checkin_responses")
      .select(
        "user_id, week_starting, created_at, calls_booked, cash_collected, followers_gained, content_volume"
      ),
  ]);

  const clientProfiles = clientsRes.data ?? [];
  const rows = (rowsRes.data ?? []) as CheckinMetricRowWithUser[];

  const now = new Date();
  const clients = aggregateClients(clientProfiles, rows, now);

  const total = clients.length;
  const flagged = clients.filter((c) => isStale(c.lastCheckin, now)).length;
  const activeThisWeek = clients.filter((c) => {
    const d = daysSince(c.lastCheckin, now);
    return d !== null && d <= 7;
  }).length;

  const summary = [
    { label: "Total clients", value: total, hint: "with an account" },
    { label: "Checked in this week", value: activeThisWeek, hint: "in the last 7 days" },
    { label: "Needs a check-in", value: flagged, hint: "14+ days quiet" },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Client health"
        description="Results and health signals across every client, from their weekly check-ins. Open any client to view their dashboard."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {summary.map((s) => (
          <div key={s.label} className="card">
            <p className="text-xs uppercase tracking-wide text-ink-soft">
              {s.label}
            </p>
            <p className="mt-2 font-display text-3xl tabular-nums text-ink">
              {s.value}
            </p>
            <p className="mt-1 text-xs text-ink-soft">{s.hint}</p>
          </div>
        ))}
      </div>

      <ClientHealthTable clients={clients} nowMs={now.getTime()} />
    </div>
  );
}
