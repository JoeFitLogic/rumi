"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Sparkles, Loader2, Check, ExternalLink } from "lucide-react";
import { runCheckinAnalysisNow } from "./actions";
import type { AnalysisResult } from "@/lib/checkin-analysis";

export default function CheckinAnalysisPanel({
  clientId,
  clientFirstName,
  lastCheckinLabel,
}: {
  clientId: string;
  clientFirstName: string;
  lastCheckinLabel: string;
}) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run() {
    setError(null);
    setResult(null);
    start(async () => {
      try {
        setResult(await runCheckinAnalysisNow(clientId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Analysis failed.");
      }
    });
  }

  return (
    <section className="card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-ink">Check-in analysis</h2>
        <button onClick={run} disabled={pending} className="btn-primary">
          {pending ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Analysing…
            </>
          ) : (
            <>
              <Sparkles size={15} strokeWidth={1.75} /> Run analysis now
            </>
          )}
        </button>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Runs the same analysis as the Saturday cron for {clientFirstName}&apos;s most recent
        week ({lastCheckinLabel}). Writes red flags, plateaus, themes, and recommendations.
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {result?.status === "analysed" && (
        <div className="mt-4 rounded-lg border border-gold/40 bg-gold-tint/30 px-4 py-3 text-sm text-ink">
          <p className="inline-flex items-center gap-1.5 font-medium text-gold-deep">
            <Check size={15} strokeWidth={2} /> Analysis written
          </p>
          <p className="mt-1 text-ink-soft">
            {result.hadRedFlags ? "Includes a red flag. " : ""}View it on the client&apos;s pages:
          </p>
          <div className="mt-2 flex flex-wrap gap-4">
            <Link href={`/dashboard?as=${clientId}`} className="inline-flex items-center gap-1.5 text-gold-deep hover:underline">
              <ExternalLink size={13} strokeWidth={1.75} /> Dashboard
            </Link>
            <Link href={`/check-in?as=${clientId}`} className="inline-flex items-center gap-1.5 text-gold-deep hover:underline">
              <ExternalLink size={13} strokeWidth={1.75} /> Check-in results
            </Link>
          </div>
        </div>
      )}

      {result?.status === "skipped" && (
        <p className="mt-3 rounded-lg border border-line bg-cream/50 px-4 py-3 text-sm text-ink-soft">
          Nothing to analyse: {result.reason}.
        </p>
      )}

      {result?.status === "errored" && (
        <p className="mt-3 text-sm text-red-600">Analysis failed: {result.error}</p>
      )}
    </section>
  );
}
