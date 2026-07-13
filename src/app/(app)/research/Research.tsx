"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Instagram, Lock } from "lucide-react";
import { StepIntro, NotesTextarea } from "./researchUi";
import StepInteractions from "./StepInteractions";
import StepForums from "./StepForums";
import StepIdeation from "./StepIdeation";
import CompetitorResearch from "./CompetitorResearch";
import { listCompetitorVideos } from "./actions";
import {
  EMPTY_NOTES,
  type ResearchNotes,
  type ContentIdea,
  type Video,
} from "@/lib/research/types";
import type { CompetitorVideo } from "@/lib/prompts/ideation-synthesis";

type StepKey = "analytics" | "interactions" | "forums" | "ideation" | "hooks";

const STEPS: { key: StepKey; label: string }[] = [
  { key: "analytics", label: "Your analytics" },
  { key: "interactions", label: "Client interactions" },
  { key: "forums", label: "External forums" },
  { key: "ideation", label: "Ideation" },
  { key: "hooks", label: "Hooks & formats" },
];

interface PersistedState {
  notes: ResearchNotes;
  ideas: ContentIdea[];
  activeStep: StepKey;
  selectedVideoIds: string[];
}

const storageKey = (clientId: string) => `rumi:research:v1:${clientId}`;

export default function Research({ clientId }: { clientId: string }) {
  const [notes, setNotes] = useState<ResearchNotes>(EMPTY_NOTES);
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [active, setActive] = useState<StepKey>("analytics");
  // Competitor videos (per-client) + which are selected to feed ideation.
  const [videos, setVideos] = useState<Video[]>([]);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const hydrated = useRef(false);

  // ── Load persisted state for this client ────────────────────────────────────
  useEffect(() => {
    hydrated.current = false;
    try {
      const raw = localStorage.getItem(storageKey(clientId));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        setNotes({ ...EMPTY_NOTES, ...(parsed.notes ?? {}) });
        setIdeas(Array.isArray(parsed.ideas) ? parsed.ideas : []);
        setSelectedVideoIds(
          new Set(Array.isArray(parsed.selectedVideoIds) ? parsed.selectedVideoIds : [])
        );
        if (parsed.activeStep && STEPS.some((s) => s.key === parsed.activeStep)) {
          setActive(parsed.activeStep);
        } else {
          setActive("analytics");
        }
      } else {
        setNotes(EMPTY_NOTES);
        setIdeas([]);
        setSelectedVideoIds(new Set());
        setActive("analytics");
      }
    } catch {
      setNotes(EMPTY_NOTES);
      setIdeas([]);
      setSelectedVideoIds(new Set());
    }
    // Allow saves only after the initial load has run for this client.
    hydrated.current = true;
  }, [clientId]);

  // ── Load per-client competitor videos (empty until migration 0012 + a scrape) ─
  useEffect(() => {
    let live = true;
    listCompetitorVideos(clientId)
      .then((v) => live && setVideos(v))
      .catch(() => live && setVideos([]));
    return () => {
      live = false;
    };
  }, [clientId]);

  // ── Persist on change (skip the first hydrate) ──────────────────────────────
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      const payload: PersistedState = {
        notes,
        ideas,
        activeStep: active,
        selectedVideoIds: [...selectedVideoIds],
      };
      localStorage.setItem(storageKey(clientId), JSON.stringify(payload));
    } catch {
      /* localStorage full or unavailable — non-fatal */
    }
  }, [clientId, notes, ideas, active, selectedVideoIds]);

  function toggleVideo(id: string) {
    setSelectedVideoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Selected competitor videos, mapped to the ideation prompt's shape.
  const selectedVideos: CompetitorVideo[] = videos
    .filter((v) => selectedVideoIds.has(v.id))
    .map((v) => ({
      creator: v.creator ?? "",
      views: v.views ?? 0,
      analysis: v.analysis ?? "",
      newConcepts: v.newConcepts ?? "",
    }));

  function setNote(key: keyof ResearchNotes, value: string) {
    setNotes((prev) => ({ ...prev, [key]: value }));
  }

  function appendNote(key: keyof ResearchNotes, text: string) {
    setNotes((prev) => {
      const cur = prev[key].trim();
      return { ...prev, [key]: cur ? `${cur}\n${text}` : text };
    });
  }

  const done: Record<StepKey, boolean> = {
    analytics: notes.analytics.trim().length > 0,
    interactions: notes.clients.trim().length > 0,
    forums: notes.forums.trim().length > 0 || notes.trends.trim().length > 0,
    ideation: ideas.length > 0,
    hooks: false,
  };

  const hasResearch =
    done.analytics || done.interactions || done.forums || notes.trends.trim().length > 0;

  return (
    <div className="space-y-8">
      <Stepper active={active} done={done} onSelect={setActive} />

      {active === "analytics" && (
        <StepAnalytics
          value={notes.analytics}
          onChange={(v) => setNote("analytics", v)}
        />
      )}

      {active === "interactions" && (
        <StepInteractions
          clientId={clientId}
          notes={notes.clients}
          onNoteChange={(v) => setNote("clients", v)}
          onAppendNote={(t) => appendNote("clients", t)}
        />
      )}

      {active === "forums" && (
        <StepForums
          clientId={clientId}
          forumsNotes={notes.forums}
          onForumsChange={(v) => setNote("forums", v)}
          onAppendForums={(t) => appendNote("forums", t)}
          trendsNotes={notes.trends}
          onTrendsChange={(v) => setNote("trends", v)}
        />
      )}

      {active === "ideation" && (
        <StepIdeation
          clientId={clientId}
          notes={notes}
          ideas={ideas}
          onIdeas={setIdeas}
          hasResearch={hasResearch}
          selectedVideos={selectedVideos}
        />
      )}

      {active === "hooks" && (
        <CompetitorResearch
          clientId={clientId}
          videos={videos}
          selectedIds={selectedVideoIds}
          onToggleSelect={toggleVideo}
          onVideosChange={setVideos}
        />
      )}
    </div>
  );
}

// ── Stepper ───────────────────────────────────────────────────────────────────
function Stepper({
  active,
  done,
  onSelect,
}: {
  active: StepKey;
  done: Record<StepKey, boolean>;
  onSelect: (k: StepKey) => void;
}) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {STEPS.map((step, i) => {
        const isActive = step.key === active;
        const isDone = done[step.key];
        return (
          <button
            key={step.key}
            onClick={() => onSelect(step.key)}
            className={`flex shrink-0 items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
              isActive
                ? "border-gold bg-gold-tint/40"
                : "border-line bg-paper hover:border-gold/50"
            }`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                isDone
                  ? "bg-gold text-white"
                  : isActive
                    ? "bg-gold-tint text-gold-deep"
                    : "bg-cream text-ink-soft"
              }`}
            >
              {isDone ? <Check size={14} strokeWidth={3} /> : i + 1}
            </span>
            <span
              className={`whitespace-nowrap text-sm ${
                isActive ? "font-medium text-ink" : "text-ink-soft"
              }`}
            >
              {step.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Step 1 — Your Analytics ─────────────────────────────────────────────────
function StepAnalytics({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <StepIntro
        eyebrow="Step 1 · Your analytics"
        title="What's already working"
        description="Start with the data you already have. What's your audience actually responding to? Pull the specifics — the more concrete, the sharper the ideas at the end."
      />

      <div className="card">
        <NotesTextarea
          label="Your notes"
          hint="Top-performing posts and their hooks · which formats land · saves, shares and DMs · audience demographics · comments that keep coming up."
          value={value}
          onChange={onChange}
          minH="min-h-[200px]"
          placeholder={
            "• Best post last month: 'I fired my VA and hired an AI' — 40k views, 900 saves\n" +
            "• Reels with a face-to-camera hook outperform text-on-screen 3:1\n" +
            "• Most-asked question in DMs: 'how do I actually set this up?'"
          }
        />
      </div>

      {/* Future Instagram OAuth seam — do NOT build now. The client_integrations
          and instagram_posts tables exist for when this is wired. */}
      <div className="card border-dashed bg-cream/40">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-tint text-gold-deep">
            <Instagram size={18} strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base text-ink">
                Connect Instagram
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-cream px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-soft">
                <Lock size={10} strokeWidth={2} /> Coming soon
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              Soon you&apos;ll connect Instagram once and Rumi will pull your
              top posts, hooks and engagement automatically — no manual notes
              needed. For now, add them by hand above.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

