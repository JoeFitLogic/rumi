"use client";

import { useState, useTransition } from "react";
import {
  Sparkles,
  Loader2,
  Check,
  Save,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";
import { StepIntro, Pill } from "./researchUi";
import { generateIdeas, saveIdea, saveIdeas } from "./actions";
import type { ContentIdea, ResearchNotes } from "@/lib/research/types";

export default function StepIdeation({
  clientId,
  notes,
  ideas,
  onIdeas,
  hasResearch,
}: {
  clientId: string;
  notes: ResearchNotes;
  ideas: ContentIdea[];
  onIdeas: (ideas: ContentIdea[]) => void;
  hasResearch: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [savingAll, setSavingAll] = useState(false);
  // Track which idea indices have been saved this session.
  const [saved, setSaved] = useState<Set<number>>(new Set());

  function run() {
    setError(null);
    start(async () => {
      try {
        // selectedVideos param is wired but empty — competitor embed is Session 8.
        const result = await generateIdeas(clientId, notes, []);
        onIdeas(result);
        setSaved(new Set());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ideation failed.");
      }
    });
  }

  function saveOne(idea: ContentIdea, index: number) {
    if (saved.has(index)) return;
    start(async () => {
      try {
        await saveIdea(clientId, idea);
        setSaved((prev) => new Set(prev).add(index));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed.");
      }
    });
  }

  function saveAll() {
    const unsaved = ideas.filter((_, i) => !saved.has(i));
    if (unsaved.length === 0) return;
    setSavingAll(true);
    setError(null);
    start(async () => {
      try {
        await saveIdeas(clientId, unsaved);
        setSaved(new Set(ideas.map((_, i) => i)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed.");
      } finally {
        setSavingAll(false);
      }
    });
  }

  const allSaved = ideas.length > 0 && saved.size === ideas.length;

  return (
    <div className="space-y-6">
      <StepIntro
        eyebrow="Step 4 · Ideation"
        title="Turn research into content ideas"
        description="Everything from steps 1–3 becomes the raw material. Claude generates specific, psychographic ideas calibrated to this client's ideal audience — then save the ones worth filming."
      />

      {!hasResearch && (
        <div className="flex gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3.5 text-sm text-amber-900">
          <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
          <span>
            You haven&apos;t added any research yet. Ideas will lean on the
            client&apos;s ICP alone — work through steps 1–3 first for
            sharper, more specific ideas.
          </span>
        </div>
      )}

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg text-ink">Generate ideas</h3>
            <p className="mt-1 text-sm text-ink-soft">
              8–10 ideas, each traceable to your research.
            </p>
          </div>
          <button onClick={run} disabled={pending} className="btn-primary">
            {pending && !savingAll ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Thinking…
              </>
            ) : (
              <>
                <Sparkles size={15} strokeWidth={1.75} />{" "}
                {ideas.length > 0 ? "Regenerate" : "Generate ideas"}
              </>
            )}
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        {ideas.length > 0 && (
          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
              <p className="text-sm text-ink-soft">
                {ideas.length} ideas · {saved.size} saved
              </p>
              <button
                onClick={saveAll}
                disabled={allSaved || pending}
                className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-50"
              >
                {savingAll ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Saving…
                  </>
                ) : allSaved ? (
                  <>
                    <Check size={14} strokeWidth={2} /> All saved
                  </>
                ) : (
                  <>
                    <Save size={14} strokeWidth={1.75} /> Save all
                  </>
                )}
              </button>
            </div>

            {ideas.map((idea, i) => (
              <IdeaCard
                key={i}
                idea={idea}
                saved={saved.has(i)}
                disabled={pending}
                onSave={() => saveOne(idea, i)}
              />
            ))}
          </div>
        )}

        {ideas.length === 0 && !pending && (
          <div className="mt-5 flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-cream/40 px-4 py-10 text-center">
            <Lightbulb size={22} strokeWidth={1.5} className="text-gold" />
            <p className="text-sm text-ink-soft">
              No ideas yet. Generate your first batch above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function IdeaCard({
  idea,
  saved,
  disabled,
  onSave,
}: {
  idea: ContentIdea;
  saved: boolean;
  disabled: boolean;
  onSave: () => void;
}) {
  const badges = [idea.pillar, idea.format, idea.source].filter(Boolean);
  return (
    <div className="rounded-lg border border-line bg-paper p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink">{idea.title}</p>
        <button
          onClick={onSave}
          disabled={saved || disabled}
          className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            saved
              ? "text-gold-deep"
              : "text-ink-soft hover:bg-gold-tint/40 hover:text-gold-deep"
          } disabled:cursor-default`}
        >
          {saved ? (
            <>
              <Check size={14} strokeWidth={2} /> Saved
            </>
          ) : (
            <>
              <Save size={14} strokeWidth={1.75} /> Save
            </>
          )}
        </button>
      </div>

      {idea.hook && (
        <p className="mt-2 border-l-2 border-gold pl-3 text-sm italic text-ink">
          &ldquo;{idea.hook}&rdquo;
        </p>
      )}

      {badges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {badges.map((b, i) => (
            <Pill key={i}>{b}</Pill>
          ))}
        </div>
      )}

      {idea.angle && (
        <p className="mt-2.5 text-xs text-ink-soft">{idea.angle}</p>
      )}
    </div>
  );
}
