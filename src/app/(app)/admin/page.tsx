import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { getActiveClient } from "@/lib/activeClient";

// Phase 2: per-client health summaries from check-in data —
// calls booked, cash collected, followers gained across all clients.
// Layout to follow Alex's admin dashboard when that codebase arrives.
export default async function AdminPage() {
  const ctx = await getActiveClient();
  if (!ctx || ctx.viewer.role !== "admin") redirect("/dashboard");

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Client health"
        description="Results and health signals across every client, from their weekly check-ins."
      />
      <div className="card">
        <p className="text-sm text-ink-soft">
          The client health dashboard is coming in the next build phase. Use
          the switcher in the top bar to view any client&apos;s dashboard now.
        </p>
      </div>
    </div>
  );
}
