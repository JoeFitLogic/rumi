"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Search,
  ChevronDown,
  Trash2,
  PenLine,
  Save,
  Check,
  Loader2,
  Lightbulb,
} from "lucide-react";
import {
  IDEA_STATUSES,
  IDEA_PILLARS,
  IDEA_FORMATS,
  normalizeIdeaStatus,
  type ContentIdeaRow,
} from "@/lib/contentBank";
import { updateIdeaStatus, updateIdeaNotes, deleteIdea } from "./contentBankActions";

export default function ContentBank({
  clientId,
  initialIdeas,
  onWriteScript,
}: {
  clientId: string;
  initialIdeas: ContentIdeaRow[];
  onWriteScript: (idea: ContentIdeaRow) => void;
}) {
  const [ideas, setIdeas] = useState<ContentIdeaRow[]>(initialIdeas);
  const [query, setQuery] = useState("");
  const [pillar, setPillar] = useState("all");
  const [format, setFormat] = useState("all");
  const [status, setStatus] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const by = (s: string) =>
      ideas.filter((i) => normalizeIdeaStatus(i.status) === s).length;
    return {
      total: ideas.length,
      scripted: by("scripted"),
      filmed: by("filmed"),
      published: by("published"),
    };
  }, [ideas]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ideas.filter((i) => {
      if (q) {
        const hay = `${i.title ?? ""} ${i.hook ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (pillar !== "all" && (i.pillar ?? "").toLowerCase() !== pillar.toLowerCase())
        return false;
      if (format !== "all" && (i.format ?? "").toLowerCase() !== format.toLowerCase())
        return false;
      if (status !== "all" && normalizeIdeaStatus(i.status) !== status) return false;
      return true;
    });
  }, [ideas, query, pillar, format, status]);

  function patch(id: string, next: Partial<ContentIdeaRow>) {
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, ...next } : i)));
  }
  function drop(id: string) {
    setIdeas((prev) => prev.filter((i) => i.id !== id));
    setExpandedId((cur) => (cur === id ? null : cur));
  }

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total ideas" value={stats.total} />
        <Stat label="Scripted" value={stats.scripted} />
        <Stat label="Filmed" value={stats.filmed} />
        <Stat label="Published" value={stats.published} />
      </div>

      {/* Filters */}
      <div className="card space-y-3">
        <div className="relative">
          <Search
            size={15}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
          />
          <input
            className="input pl-9"
            placeholder="Search by title or hook"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FilterSelect value={pillar} onChange={setPillar} allLabel="All pillars" options={IDEA_PILLARS} />
          <FilterSelect value={format} onChange={setFormat} allLabel="All formats" options={IDEA_FORMATS} />
          <FilterSelect value={status} onChange={setStatus} allLabel="All statuses" options={IDEA_STATUSES} />
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 border-dashed bg-cream/40 py-12 text-center">
          <Lightbulb size={22} strokeWidth={1.5} className="text-gold" />
          <p className="max-w-sm text-sm text-ink-soft">
            {ideas.length === 0
              ? "No saved ideas yet. Generate and save ideas in Research → Ideation, and they'll land here."
              : "No ideas match those filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((idea) => (
            <IdeaCard
              key={idea.id}
              clientId={clientId}
              idea={idea}
              expanded={idea.id === expandedId}
              onToggle={() =>
                setExpandedId((cur) => (cur === idea.id ? null : idea.id))
              }
              onPatch={(next) => patch(idea.id, next)}
              onDrop={() => drop(idea.id)}
              onWriteScript={() => onWriteScript(idea)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card py-4">
      <p className="font-display text-2xl text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink-soft">{label}</p>
    </div>
  );
}

function IdeaCard({
  clientId,
  idea,
  expanded,
  onToggle,
  onPatch,
  onDrop,
  onWriteScript,
}: {
  clientId: string;
  idea: ContentIdeaRow;
  expanded: boolean;
  onToggle: () => void;
  onPatch: (next: Partial<ContentIdeaRow>) => void;
  onDrop: () => void;
  onWriteScript: () => void;
}) {
  const [pending, start] = useTransition();
  const [noteDraft, setNoteDraft] = useState(idea.notes ?? "");
  const [noteSaved, setNoteSaved] = useState(false);
  const status = normalizeIdeaStatus(idea.status);
  const badges = [idea.pillar, idea.format, idea.source].filter(Boolean) as string[];

  function changeStatus(next: string) {
    onPatch({ status: next });
    start(async () => {
      try {
        await updateIdeaStatus(clientId, idea.id, next);
      } catch {
        /* keep optimistic value; a reload reflects the truth */
      }
    });
  }

  function saveNote() {
    setNoteSaved(false);
    start(async () => {
      try {
        await updateIdeaNotes(clientId, idea.id, noteDraft);
        onPatch({ notes: noteDraft.trim() || null });
        setNoteSaved(true);
        setTimeout(() => setNoteSaved(false), 1500);
      } catch {
        /* no-op */
      }
    });
  }

  function remove() {
    if (!window.confirm("Delete this idea? This can't be undone.")) return;
    start(async () => {
      try {
        await deleteIdea(clientId, idea.id);
        onDrop();
      } catch {
        /* no-op */
      }
    });
  }

  return (
    <div className="card flex flex-col">
      <button onClick={onToggle} className="text-left" aria-expanded={expanded}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-ink">{idea.title}</p>
          <ChevronDown
            size={16}
            strokeWidth={1.75}
            className={`mt-0.5 shrink-0 text-ink-soft transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </div>
        {idea.hook && (
          <p className="mt-2 line-clamp-2 border-l-2 border-gold pl-3 text-sm italic text-ink">
            &ldquo;{idea.hook}&rdquo;
          </p>
        )}
      </button>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={status} />
        {badges.map((b) => (
          <span
            key={b}
            className="rounded bg-cream px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-soft"
          >
            {b}
          </span>
        ))}
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-line pt-4">
          {idea.angle && <p className="text-xs text-ink-soft">{idea.angle}</p>}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink">Status</label>
            <select
              value={status}
              disabled={pending}
              onChange={(e) => changeStatus(e.target.value)}
              className="cursor-pointer rounded-md border border-line bg-cream px-2 py-1 text-xs font-medium text-ink focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 disabled:opacity-50"
            >
              {IDEA_STATUSES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink">Notes</label>
            <textarea
              className="input min-h-[64px] resize-y text-sm"
              placeholder="Add a note — an angle, a reminder, who it's for…"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
            />
            <button
              onClick={saveNote}
              disabled={pending || noteDraft === (idea.notes ?? "")}
              className="btn-ghost mt-2 px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {pending ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Saving…
                </>
              ) : noteSaved ? (
                <>
                  <Check size={14} strokeWidth={2} /> Saved
                </>
              ) : (
                <>
                  <Save size={14} strokeWidth={1.75} /> Save note
                </>
              )}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
            <button onClick={onWriteScript} className="btn-primary px-3 py-1.5 text-xs">
              <PenLine size={14} strokeWidth={1.75} /> Write script
            </button>
            <button
              onClick={remove}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-soft transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 size={14} strokeWidth={1.75} /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    idea: "bg-cream text-ink-soft",
    scripted: "bg-blue-50 text-blue-700",
    filmed: "bg-amber-50 text-amber-800",
    published: "bg-green-50 text-green-700",
  };
  const label = IDEA_STATUSES.find((o) => o.value === status)?.label ?? "Idea";
  return (
    <span
      className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        tone[status] ?? tone.idea
      }`}
    >
      {label}
    </span>
  );
}

function FilterSelect({
  value,
  onChange,
  allLabel,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      className="input cursor-pointer appearance-none bg-[right_0.6rem_center] bg-no-repeat pr-8"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23a99' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="all">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
