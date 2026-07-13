"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2, Plus } from "lucide-react";
import { StepIntro, NotesTextarea, SelectableCard, Pill } from "./researchUi";
import { analyzeTranscript } from "./actions";
import type { TranscriptCard } from "@/lib/research/types";

const CATEGORY_LABEL: Record<TranscriptCard["category"], string> = {
  pain_point: "Pain point",
  recurring_phrase: "Recurring phrase",
  limiting_belief: "Limiting belief",
};

function formatCard(c: TranscriptCard): string {
  const label = CATEGORY_LABEL[c.category];
  const ctx = c.context ? ` — ${c.context}` : "";
  return `[${label}] "${c.text}"${ctx}`;
}

export default function StepInteractions({
  clientId,
  notes,
  onNoteChange,
  onAppendNote,
}: {
  clientId: string;
  notes: string;
  onNoteChange: (v: string) => void;
  onAppendNote: (text: string) => void;
}) {
  const [transcript, setTranscript] = useState("");
  const [cards, setCards] = useState<TranscriptCard[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function run() {
    setError(null);
    if (!transcript.trim()) {
      setError("Paste a call transcript first.");
      return;
    }
    start(async () => {
      try {
        const result = await analyzeTranscript(clientId, transcript);
        setCards(result);
        setSelected(new Set());
        if (result.length === 0) {
          setError("No high-signal language found in that transcript.");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Analysis failed.");
      }
    });
  }

  function addSelected() {
    const chosen = cards.filter((c) => selected.has(c.id));
    if (chosen.length === 0) return;
    onAppendNote(chosen.map(formatCard).join("\n"));
    // Drop the added cards so it's clear what's left to review.
    setCards((prev) => prev.filter((c) => !selected.has(c.id)));
    setSelected(new Set());
  }

  return (
    <div className="space-y-6">
      <StepIntro
        eyebrow="Step 2 · Client interactions"
        title="What your clients actually say"
        description="Jot down what comes up in DMs, calls and coaching sessions — then let the transcript analyser pull the sharpest language out of a real call for you."
      />

      <div className="card space-y-4">
        <NotesTextarea
          label="Your notes"
          hint="Objections, questions, wins, the phrases your clients keep using. Selected cards below get appended here."
          value={notes}
          onChange={onNoteChange}
          placeholder="e.g. Three clients this week said they feel like they're 'shouting into the void'…"
        />
      </div>

      <div className="card space-y-4">
        <div>
          <h3 className="font-display text-lg text-ink">Transcript analyser</h3>
          <p className="mt-1 text-sm text-ink-soft">
            Paste a sales or coaching call transcript. Claude extracts pain
            points, recurring phrases and limiting beliefs in the client&apos;s
            own words.
          </p>
        </div>

        <textarea
          className="input min-h-[160px] resize-y font-mono text-xs"
          placeholder="Paste the full call transcript here…"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button onClick={run} disabled={pending} className="btn-primary">
          {pending ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Analysing…
            </>
          ) : (
            <>
              <Sparkles size={15} strokeWidth={1.75} /> Extract language
            </>
          )}
        </button>

        {cards.length > 0 && (
          <div className="space-y-3 border-t border-line pt-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink-soft">
                {selected.size} of {cards.length} selected
              </p>
              <button
                onClick={addSelected}
                disabled={selected.size === 0}
                className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-50"
              >
                <Plus size={14} strokeWidth={2} /> Add {selected.size || ""} to
                notes
              </button>
            </div>
            {cards.map((c) => (
              <SelectableCard
                key={c.id}
                selected={selected.has(c.id)}
                onToggle={() => toggle(c.id)}
              >
                <div className="mb-1.5">
                  <Pill>{CATEGORY_LABEL[c.category]}</Pill>
                </div>
                <p className="text-sm text-ink">&ldquo;{c.text}&rdquo;</p>
                {c.context && (
                  <p className="mt-1 text-xs text-ink-soft">{c.context}</p>
                )}
              </SelectableCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
