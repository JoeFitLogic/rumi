import { redirect } from "next/navigation";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { getActiveClient } from "@/lib/activeClient";
import { createClient } from "@/lib/supabase/server";
import { allPeriods, fmtDate, type CheckinMetricRow } from "@/lib/dashboard";
import MetricCards from "./MetricCards";

interface CheckinAnalysis {
  week_starting: string;
  created_at: string;
  recommendations: string | null;
  red_flags: string | null;
  themes: string | null;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const asParam = typeof params.as === "string" ? params.as : null;

  const ctx = await getActiveClient(asParam);
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const [checkinsRes, analysisRes] = await Promise.all([
    supabase
      .from("checkin_responses")
      .select(
        "week_starting, created_at, calls_booked, cash_collected, followers_gained, content_volume"
      )
      .eq("user_id", ctx.activeClientId)
      .order("week_starting", { ascending: false }),
    supabase
      .from("checkin_analysis")
      .select("week_starting, created_at, recommendations, red_flags, themes")
      .eq("user_id", ctx.activeClientId)
      .order("week_starting", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const rows = (checkinsRes.data ?? []) as CheckinMetricRow[];
  const analysis = (analysisRes.data ?? null) as CheckinAnalysis | null;
  const periods = allPeriods(rows, new Date());

  const firstName = (ctx.activeClient.name ?? "there").split(" ")[0];

  return (
    <div>
      <PageHeader
        eyebrow="Dashboard"
        title={`Welcome back, ${firstName}`}
        description="Your key numbers and recommendations, pulled from your weekly check-ins."
      />

      <MetricCards periods={periods} hasData={rows.length > 0} />

      <Recommendations analysis={analysis} />
    </div>
  );
}

function Recommendations({ analysis }: { analysis: CheckinAnalysis | null }) {
  if (!analysis) {
    return (
      <section className="card">
        <p className="eyebrow mb-2">Recommendations</p>
        <div className="flex flex-col items-start gap-3">
          <p className="max-w-md text-sm text-ink-soft">
            Once you complete your first weekly check-in, your tailored
            recommendations, themes, and any red flags will show up here.
          </p>
          <Link href="/check-in" className="btn-primary">
            <ClipboardCheck size={16} strokeWidth={1.75} />
            Start your first check-in
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <p className="eyebrow">Recommendations</p>
        <span className="text-xs text-ink-soft">
          Week of {fmtDate(analysis.week_starting)}
        </span>
      </div>

      <div className="space-y-6">
        <AnalysisBlock body={analysis.recommendations} fallback="No recommendations for this week." />

        {analysis.red_flags?.trim() && (
          <div className="rounded-md border-l-2 border-gold-deep bg-gold-tint/40 py-3 pl-4 pr-3">
            <p className="eyebrow mb-1.5 text-gold-deep">Red flags</p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
              {analysis.red_flags.trim()}
            </p>
          </div>
        )}

        {analysis.themes?.trim() && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Themes
            </p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">
              {analysis.themes.trim()}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function AnalysisBlock({
  body,
  fallback,
}: {
  body: string | null;
  fallback: string;
}) {
  return (
    <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
      {body?.trim() || fallback}
    </p>
  );
}
