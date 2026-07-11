import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, ClipboardList } from "lucide-react";
import { getActiveClient } from "@/lib/activeClient";
import { createClient } from "@/lib/supabase/server";
import { groupedOnboarding } from "@/lib/onboarding";
import {
  fmtDate,
  relativeLabel,
  isStale,
  releaseCountdown,
} from "@/lib/dashboard";
import type { AccountStatus, Profile } from "@/lib/types";
import ClientHeaderActions from "./ClientHeaderActions";
import VaPanel from "./VaPanel";
import OnboardingEditor from "./OnboardingEditor";
import VoiceTranscriptCard from "./VoiceTranscriptCard";

interface StrategyRow {
  id: string;
  status: string;
  released_at: string | null;
  completed_at: string | null;
  review_deadline: string | null;
}

export default async function AdminClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const ctx = await getActiveClient();
  if (!ctx) redirect("/login");
  if (ctx.viewer.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();

  const [
    { data: client },
    { data: onboarding },
    { data: strategyRow },
    { data: lastCheckin },
    { data: vaRows },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle<Profile>(),
    supabase
      .from("onboarding_responses")
      .select("*")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("strategies")
      .select("id, status, released_at, completed_at, review_deadline")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("checkin_responses")
      .select("created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, name, email, linked_user_id")
      .eq("role", "va"),
  ]);

  if (!client) notFound();

  const now = new Date();
  const firstName = (client.name ?? "this client").split(" ")[0];
  const strategy = strategyRow as StrategyRow | null;
  const onboardingRow = onboarding as (Record<string, unknown> & { id: string }) | null;

  const vas = (vaRows ?? []) as {
    id: string;
    name: string | null;
    email: string | null;
    linked_user_id: string | null;
  }[];
  const linkedVas = vas.filter((v) => v.linked_user_id === id);
  const availableVas = vas.filter((v) => v.linked_user_id !== id);

  const lastCheckinAt = (lastCheckin as { created_at?: string } | null)?.created_at ?? null;
  const stale = isStale(lastCheckinAt, now);

  return (
    <div className="max-w-3xl">
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeft size={15} strokeWidth={1.75} />
        Back to client health
      </Link>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-2.5">
              <span
                className={`size-2.5 rounded-full ${stale ? "bg-red-400" : "bg-gold"}`}
                title={stale ? "No recent check-in" : "Checked in recently"}
              />
              <h1 className="font-display text-2xl font-medium tracking-tight text-ink">
                {client.name ?? "Unnamed client"}
              </h1>
            </div>
            <p className="mt-1 text-sm text-ink-soft">{client.email}</p>
            <p className="mt-1 text-xs text-ink-soft">
              Last check-in: {relativeLabel(lastCheckinAt, now)}
            </p>
          </div>

          <ClientHeaderActions
            clientId={client.id}
            status={(client.account_status ?? "active") as AccountStatus}
            clientName={firstName}
          />
        </div>

        <div className="mt-4 border-t border-line pt-4">
          <Link
            href={`/dashboard?as=${client.id}`}
            className="inline-flex items-center gap-1.5 text-sm text-gold-deep hover:underline"
          >
            <ExternalLink size={14} strokeWidth={1.75} />
            View dashboard as {firstName}
          </Link>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {/* ── Strategy panel ───────────────────────────────────────────── */}
        <StrategyPanel strategy={strategy} clientId={client.id} now={now} />

        {/* ── VA linking ───────────────────────────────────────────────── */}
        <VaPanel clientId={client.id} linkedVas={linkedVas} availableVas={availableVas} />

        {/* ── Voice transcript + onboarding answers ────────────────────── */}
        {onboardingRow ? (
          <>
            <VoiceTranscriptCard
              onboardingId={onboardingRow.id}
              clientId={client.id}
              initialValue={
                typeof onboardingRow.voice_transcript === "string"
                  ? onboardingRow.voice_transcript
                  : ""
              }
            />
            <OnboardingEditor
              onboardingId={onboardingRow.id}
              clientId={client.id}
              groups={groupedOnboarding(onboardingRow)}
            />
          </>
        ) : (
          <section className="card">
            <span className="mb-3 inline-flex size-9 items-center justify-center rounded-full bg-gold-tint text-gold-deep">
              <ClipboardList size={18} strokeWidth={1.75} />
            </span>
            <h2 className="font-display text-lg text-ink">No onboarding yet</h2>
            <p className="mt-1 max-w-lg text-sm text-ink-soft">
              {firstName} hasn&apos;t submitted the onboarding form. Once they do, their
              answers and voice sample will be editable here.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function StrategyPanel({
  strategy,
  clientId,
  now,
}: {
  strategy: StrategyRow | null;
  clientId: string;
  now: Date;
}) {
  let label: string;
  let tone: "muted" | "review" | "done" | "warn" = "muted";

  if (!strategy) {
    label = "No strategy yet";
  } else if (strategy.released_at) {
    label = `Released ${fmtDate(strategy.released_at)}`;
    tone = "done";
  } else if (strategy.status === "complete") {
    label = `In review · ${releaseCountdown(strategy.review_deadline, now)}`;
    tone = "review";
  } else if (strategy.status === "failed") {
    label = "Generation failed";
    tone = "warn";
  } else {
    label = strategy.status === "generating" ? "Generating…" : "Queued";
  }

  const toneClass = {
    muted: "bg-cream text-ink-soft",
    review: "bg-gold-tint text-gold-deep",
    done: "bg-gold-tint text-gold-deep",
    warn: "bg-red-50 text-red-700",
  }[tone];

  return (
    <section className="card">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-ink">Strategy</h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${toneClass}`}>
          {label}
        </span>
      </div>
      {strategy && strategy.completed_at && !strategy.released_at && (
        <p className="mt-2 text-xs text-ink-soft">
          Completed {fmtDate(strategy.completed_at)}
        </p>
      )}
      <div className="mt-4">
        <Link
          href={`/strategy?as=${clientId}`}
          className="inline-flex items-center gap-1.5 text-sm text-gold-deep hover:underline"
        >
          <ExternalLink size={14} strokeWidth={1.75} />
          {strategy ? "Open strategy" : "Strategy workspace"}
        </Link>
      </div>
    </section>
  );
}
