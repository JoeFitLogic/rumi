"use client";

import { useEffect, useState } from "react";
import { Search, Loader2, Plus, RotateCw, AlertTriangle } from "lucide-react";
import { StepIntro, NotesTextarea, SelectableCard, Pill } from "./researchUi";
import { startReddit, checkReddit, extractRedditQuotes } from "./actions";
import type { RedditQuote } from "@/lib/research/types";

type Phase =
  | "idle"
  | "picking"
  | "running"
  | "extracting"
  | "done"
  | "empty"
  | "error"
  | "timeout";

interface RunInfo {
  runId: string;
  datasetId: string;
  subreddits: string[];
  keywords: string[];
}

const POLL_MS = 4000;
const FIRST_POLL_MS = 3000;
const MAX_POLLS = 45; // ~3 minutes before we offer a graceful timeout

function formatQuote(q: RedditQuote): string {
  const meta = [q.type, q.subreddit].filter(Boolean).join(" · ");
  const ctx = q.context ? ` — ${q.context}` : "";
  return `[${meta}] "${q.text}"${ctx}`;
}

export default function StepForums({
  clientId,
  forumsNotes,
  onForumsChange,
  onAppendForums,
  trendsNotes,
  onTrendsChange,
}: {
  clientId: string;
  forumsNotes: string;
  onForumsChange: (v: string) => void;
  onAppendForums: (text: string) => void;
  trendsNotes: string;
  onTrendsChange: (v: string) => void;
}) {
  const [keywords, setKeywords] = useState("");
  const [niche, setNiche] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [run, setRun] = useState<RunInfo | null>(null);
  const [statusText, setStatusText] = useState("");
  const [quotes, setQuotes] = useState<RedditQuote[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const busy = phase === "picking" || phase === "running" || phase === "extracting";

  // ── Poll the Apify run while it's active ────────────────────────────────────
  useEffect(() => {
    if (phase !== "running" || !run) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled) return;
      attempts++;
      try {
        const { status, terminal } = await checkReddit(clientId, run.runId);
        if (cancelled) return;
        setStatusText(status);
        if (terminal) {
          if (status === "SUCCEEDED") {
            setPhase("extracting");
          } else {
            setError(`The scrape ${status.toLowerCase().replace("-", " ")}.`);
            setPhase("error");
          }
          return;
        }
        if (attempts >= MAX_POLLS) {
          setPhase("timeout");
          return;
        }
        timer = setTimeout(tick, POLL_MS);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Couldn't check scrape status.");
        setPhase("error");
      }
    };

    timer = setTimeout(tick, FIRST_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phase, run, clientId]);

  // ── Extract quotes once the run succeeds ────────────────────────────────────
  useEffect(() => {
    if (phase !== "extracting" || !run) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await extractRedditQuotes(
          clientId,
          run.datasetId,
          run.keywords,
          run.subreddits
        );
        if (cancelled) return;
        setQuotes(result);
        setSelected(new Set());
        setPhase(result.length > 0 ? "done" : "empty");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Couldn't extract quotes.");
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, run, clientId]);

  async function begin() {
    setError(null);
    setQuotes([]);
    if (!keywords.trim()) {
      setError("Add at least one keyword.");
      return;
    }
    setPhase("picking");
    setStatusText("");
    try {
      const info = await startReddit(clientId, keywords, niche);
      setRun(info);
      setStatusText("Starting scrape…");
      setPhase("running");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the scrape.");
      setPhase("error");
    }
  }

  function reset() {
    setPhase("idle");
    setRun(null);
    setQuotes([]);
    setSelected(new Set());
    setError(null);
    setStatusText("");
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addSelected() {
    const chosen = quotes.filter((q) => selected.has(q.id));
    if (chosen.length === 0) return;
    onAppendForums(chosen.map(formatQuote).join("\n"));
    setQuotes((prev) => prev.filter((q) => !selected.has(q.id)));
    setSelected(new Set());
  }

  return (
    <div className="space-y-6">
      <StepIntro
        eyebrow="Step 3 · External forums"
        title="What your audience says when you're not listening"
        description="Point the Reddit scraper at your audience's keywords. Claude picks the 5 most relevant communities, scrapes their top posts, and pulls out the highest-signal language."
      />

      <div className="card space-y-4">
        <NotesTextarea
          label="Your notes"
          hint="Anything you've spotted in Reddit, YouTube comments, Facebook groups. Selected quotes below get appended here."
          value={forumsNotes}
          onChange={onForumsChange}
          placeholder="e.g. r/loseit is full of people who feel ashamed tracking calories in public…"
        />
      </div>

      <div className="card space-y-4">
        <div>
          <h3 className="font-display text-lg text-ink">Reddit scraper</h3>
          <p className="mt-1 text-sm text-ink-soft">
            Keywords your ideal client would search or complain about, plus your
            niche for context.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm text-ink">
              Keywords <span className="text-ink-soft">(comma-separated)</span>
            </label>
            <input
              className="input"
              placeholder="calorie counting, binge eating, food guilt"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              disabled={busy}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-ink">
              Niche <span className="text-ink-soft">(optional)</span>
            </label>
            <input
              className="input"
              placeholder="anti-diet nutrition coaching"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        {error && (phase === "error" || phase === "idle") && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {phase === "idle" || phase === "error" ? (
          <button onClick={begin} className="btn-primary">
            <Search size={15} strokeWidth={1.75} />{" "}
            {phase === "error" ? "Try again" : "Scrape Reddit"}
          </button>
        ) : null}

        {/* Progress */}
        {(phase === "picking" || phase === "running" || phase === "extracting") && (
          <div className="rounded-lg border border-line bg-cream/50 px-4 py-4">
            <div className="flex items-center gap-2.5 text-sm text-ink">
              <Loader2 size={16} className="animate-spin text-gold-deep" />
              {phase === "picking" && "Picking the best subreddits…"}
              {phase === "running" && "Scraping Reddit…"}
              {phase === "extracting" && "Pulling out the highest-signal quotes…"}
            </div>
            {run && run.subreddits.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {run.subreddits.map((s) => (
                  <Pill key={s}>r/{s}</Pill>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-ink-soft">
              This usually takes 30–90 seconds. You can keep working in other
              steps — just don&apos;t leave this one.
              {statusText && phase === "running" ? ` (${statusText})` : ""}
            </p>
          </div>
        )}

        {/* Graceful timeout */}
        {phase === "timeout" && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3.5">
            <div className="flex gap-2.5 text-sm text-amber-900">
              <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
              <span>
                This scrape is taking longer than usual. It may still finish.
              </span>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setPhase("running")}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                <RotateCw size={14} strokeWidth={2} /> Keep waiting
              </button>
              <button onClick={reset} className="btn-ghost px-3 py-1.5 text-xs">
                Start over
              </button>
            </div>
          </div>
        )}

        {phase === "empty" && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-cream/50 px-4 py-3.5">
            <p className="text-sm text-ink-soft">
              No usable quotes came back. Try broader or different keywords.
            </p>
            <button onClick={reset} className="btn-ghost px-3 py-1.5 text-xs">
              <RotateCw size={14} strokeWidth={2} /> Retry
            </button>
          </div>
        )}

        {/* Results */}
        {phase === "done" && quotes.length > 0 && (
          <div className="space-y-3 border-t border-line pt-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink-soft">
                {selected.size} of {quotes.length} selected
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={addSelected}
                  disabled={selected.size === 0}
                  className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  <Plus size={14} strokeWidth={2} /> Add {selected.size || ""} to
                  notes
                </button>
                <button onClick={reset} className="btn-ghost px-3 py-1.5 text-xs">
                  <RotateCw size={14} strokeWidth={2} /> New scrape
                </button>
              </div>
            </div>
            {quotes.map((q) => (
              <SelectableCard
                key={q.id}
                selected={selected.has(q.id)}
                onToggle={() => toggle(q.id)}
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <Pill>{q.type}</Pill>
                  {q.subreddit && <Pill>{q.subreddit}</Pill>}
                </div>
                <p className="text-sm text-ink">&ldquo;{q.text}&rdquo;</p>
                {q.context && (
                  <p className="mt-1 text-xs text-ink-soft">{q.context}</p>
                )}
                {q.postTitle && (
                  <p className="mt-1 text-xs italic text-ink-soft">
                    from &ldquo;{q.postTitle}&rdquo;
                  </p>
                )}
              </SelectableCard>
            ))}
          </div>
        )}
      </div>

      {/* TRENDS — a fourth research source the ideation prompt expects. Lightly
          placed here alongside external listening; wired so notes.trends flows
          into Step 4. */}
      <div className="card space-y-4">
        <NotesTextarea
          label="Trends & cultural context"
          hint="Anything in the wider culture your audience is reacting to right now — a viral post, a news story, a shift in the conversation. Feeds into ideation."
          value={trendsNotes}
          onChange={onTrendsChange}
          minH="min-h-[90px]"
          placeholder="e.g. Everyone's talking about 'cortisol face' — my audience keeps sending me that reel…"
        />
      </div>
    </div>
  );
}
