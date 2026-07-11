import { redirect } from "next/navigation";
import Link from "next/link";
import { ClipboardCheck, ChevronRight } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { getActiveClient } from "@/lib/activeClient";
import { createClient } from "@/lib/supabase/server";
import {
  aggregateClients,
  isStale,
  daysSince,
  fmtDate,
  releaseCountdown,
  type CheckinMetricRowWithUser,
} from "@/lib/dashboard";
import ClientHealthTable from "./ClientHealthTable";

interface ReviewRow {
  id: string;
  user_id: string;
  client_name: string | null;
  completed_at: string | null;
  review_deadline: string | null;
}

export default async function AdminPage() {
  const ctx = await getActiveClient();
  if (!ctx || ctx.viewer.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const [clientsRes, rowsRes, reviewRes] = await Promise.all([
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
    // Strategies complete but not yet released → the admin review queue.
    supabase
      .from("strategies")
      .select("id, user_id, client_name, completed_at, review_deadline")
      .eq("status", "complete")
      .is("released_at", null)
      .order("completed_at", { ascending: true }),
  ]);

  const clientProfiles = clientsRes.data ?? [];
  const rows = (rowsRes.data ?? []) as CheckinMetricRowWithUser[];
  const reviewRows = (reviewRes.data ?? []) as ReviewRow[];

  const now = new Date();
  const clients = aggregateClients(clientProfiles, rows, now);

  // Resolve a display name per review item (profile name wins over the
  // strategy's stored first name).
  const nameById = new Map(clientProfiles.map((c) => [c.id, c.name] as const));
  const reviewQueue = reviewRows.map((r) => ({
    ...r,
    displayName: nameById.get(r.user_id) ?? r.client_name ?? "Unnamed client",
  }));

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

      {/* ── Awaiting review ─────────────────────────────────────────── */}
      <section className="card mb-6 p-0">
        <div className="flex items-center gap-2 border-b border-line px-6 py-4">
          <ClipboardCheck size={16} strokeWidth={1.75} className="text-gold-deep" />
          <p className="text-sm font-medium text-ink">Awaiting review</p>
          {reviewQueue.length > 0 && (
            <span className="rounded-full bg-gold-tint px-2 py-0.5 text-xs font-medium text-gold-deep">
              {reviewQueue.length}
            </span>
          )}
        </div>

        {reviewQueue.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-ink-soft">
            Nothing waiting on you.
          </p>
        ) : (
          <ul>
            {reviewQueue.map((r) => (
              <li key={r.id} className="border-b border-line/60 last:border-0">
                <Link
                  href={`/strategy?as=${r.user_id}`}
                  className="flex items-center justify-between gap-4 px-6 py-3.5 transition-colors hover:bg-cream"
                >
                  <div className="min-w-0">
                    <span className="block truncate font-medium text-ink">
                      {r.displayName}
                    </span>
                    <span className="block text-xs text-ink-soft">
                      Completed {fmtDate(r.completed_at)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-gold-tint px-2.5 py-1 text-xs font-medium text-gold-deep">
                      {releaseCountdown(r.review_deadline, now)}
                    </span>
                    <ChevronRight size={16} strokeWidth={1.75} className="text-ink-soft" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ClientHealthTable clients={clients} nowMs={now.getTime()} />
    </div>
  );
}
