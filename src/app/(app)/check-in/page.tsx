import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { getActiveClient } from "@/lib/activeClient";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  mondayOf,
  type CheckinRow,
  type CheckinAnalysisRow,
} from "@/lib/checkin";
import CheckIn from "./CheckIn";

export default async function CheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const asParam = typeof params.as === "string" ? params.as : null;

  const ctx = await getActiveClient(asParam);
  if (!ctx) redirect("/login");

  const isAdmin = ctx.viewer.role === "admin";
  const firstName = (ctx.activeClient.name ?? "").split(" ")[0] || "there";
  const currentWeek = mondayOf(new Date());

  // Reads via service role + explicit owner filter — caller already authorized
  // for activeClientId; consistent with the guidelines' write pattern.
  const db = createAdminClient();
  const [{ data: rows }, { data: analysis }] = await Promise.all([
    db
      .from("checkin_responses")
      .select("*")
      .eq("user_id", ctx.activeClientId)
      .order("week_starting", { ascending: false }),
    db
      .from("checkin_analysis")
      .select("*")
      .eq("user_id", ctx.activeClientId)
      .order("week_starting", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const allRows = (rows ?? []) as CheckinRow[];
  const currentWeekRow = allRows.find((r) => r.week_starting.slice(0, 10) === currentWeek) ?? null;

  return (
    <div>
      <PageHeader
        eyebrow="Check In"
        title="Weekly check-in"
        description="Log your week — business numbers, content wins, and how you're actually doing."
      />
      <CheckIn
        clientId={ctx.activeClientId}
        isAdmin={isAdmin}
        clientFirstName={firstName}
        currentWeek={currentWeek}
        currentWeekRow={currentWeekRow}
        allRows={allRows}
        latestAnalysis={(analysis ?? null) as CheckinAnalysisRow | null}
      />
    </div>
  );
}
