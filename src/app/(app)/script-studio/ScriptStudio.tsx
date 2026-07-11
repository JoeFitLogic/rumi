"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Sparkles,
  Loader2,
  Wand2,
  Copy,
  Check,
  Trash2,
  ChevronDown,
  Search,
  AlertTriangle,
} from "lucide-react";
import Markdown from "@/components/Markdown";
import {
  CONTENT_TYPES,
  HOOK_TYPES,
  PILLARS,
  AUDIENCE_STAGES,
  LENGTHS,
  STATUSES,
  normalizeStatus,
  labelFor,
  type ScriptRow,
} from "@/lib/scripts";
import {
  generateScript,
  refineScript,
  updateScriptStatus,
  deleteScript,
} from "./actions";

export default function ScriptStudio({
  clientId,
  isAdmin,
  hasVoice,
  clientFirstName,
  initialScripts,
  prefillTopic,
}: {
  clientId: string;
  isAdmin: boolean;
  hasVoice: boolean;
  clientFirstName: string;
  initialScripts: ScriptRow[];
  prefillTopic: string;
}) {
  const [scripts, setScripts] = useState<ScriptRow[]>(initialScripts);
  const [activeId, setActiveId] = useState<string | null>(null);

  const active = scripts.find((s) => s.id === activeId) ?? null;

  function upsert(row: ScriptRow) {
    setScripts((prev) => {
      const without = prev.filter((s) => s.id !== row.id);
      return [row, ...without];
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Generator
          clientId={clientId}
          isAdmin={isAdmin}
          hasVoice={hasVoice}
          clientFirstName={clientFirstName}
          prefillTopic={prefillTopic}
          onGenerated={(row) => {
            upsert(row);
            setActiveId(row.id);
          }}
        />
        {active && (
          <ResultPanel
            key={active.id}
            clientId={clientId}
            script={active}
            onRefined={(row) => upsert(row)}
          />
        )}
      </div>

      <Library
        clientId={clientId}
        scripts={scripts}
        activeId={activeId}
        onSelect={setActiveId}
        onStatusChanged={(row) => upsert(row)}
        onDeleted={(id) => {
          setScripts((prev) => prev.filter((s) => s.id !== id));
          setActiveId((cur) => (cur === id ? null : cur));
        }}
      />
    </div>
  );
}

// ── Generator (left) ───────────────────────────────────────────────────────
function Generator({
  clientId,
  isAdmin,
  hasVoice,
  clientFirstName,
  prefillTopic,
  onGenerated,
}: {
  clientId: string;
  isAdmin: boolean;
  hasVoice: boolean;
  clientFirstName: string;
  prefillTopic: string;
  onGenerated: (row: ScriptRow) => void;
}) {
  const [topic, setTopic] = useState(prefillTopic);
  const [contentType, setContentType] = useState(CONTENT_TYPES[0].value);
  const [hookType, setHookType] = useState(HOOK_TYPES[0].value);
  const [pillar, setPillar] = useState(PILLARS[2].value); // perspective
  const [audienceStage, setAudienceStage] = useState(AUDIENCE_STAGES[0].value);
  const [length, setLength] = useState(LENGTHS[1].value); // 60s
  const [additionalContext, setAdditionalContext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ctDesc = CONTENT_TYPES.find((c) => c.value === contentType)?.description;

  function run() {
    setError(null);
    if (!topic.trim()) {
      setError("Add a topic first.");
      return;
    }
    start(async () => {
      try {
        const row = await generateScript({
          clientId,
          topic,
          contentType,
          hookType,
          pillar,
          audienceStage,
          length,
          additionalContext,
        });
        onGenerated(row);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Generation failed.");
      }
    });
  }

  return (
    <section className="card">
      <h2 className="font-display text-lg text-ink">Generate a script</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Written in {clientFirstName}&apos;s voice from their onboarding answers.
      </p>

      {isAdmin && !hasVoice && (
        <div className="mt-4 flex gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
          <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
          <span>
            No voice sample yet — scripts will sound more generic. Add a{" "}
            <span className="font-medium">voice transcript</span> to{" "}
            {clientFirstName}&apos;s onboarding to match how they actually speak.
          </span>
        </div>
      )}

      <div className="mt-5 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-ink">Topic</label>
          <textarea
            className="input min-h-[90px] resize-y"
            placeholder="What's the video about? Paste the idea, the angle, any notes…"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>

        <div>
          <Select
            label="Content type"
            value={contentType}
            onChange={setContentType}
            options={CONTENT_TYPES}
          />
          {ctDesc && <p className="mt-1.5 text-xs text-ink-soft">{ctDesc}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Hook" value={hookType} onChange={setHookType} options={HOOK_TYPES} />
          <Select label="Length" value={length} onChange={setLength} options={LENGTHS} />
          <Select label="Pillar" value={pillar} onChange={setPillar} options={PILLARS} />
          <Select
            label="Audience stage"
            value={audienceStage}
            onChange={setAudienceStage}
            options={AUDIENCE_STAGES}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-ink">
            Additional context <span className="text-ink-soft">(optional)</span>
          </label>
          <textarea
            className="input min-h-[64px] resize-y"
            placeholder="Anything else to steer it — a story to include, a CTA, a product to mention…"
            value={additionalContext}
            onChange={(e) => setAdditionalContext(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button onClick={run} disabled={pending} className="btn-primary">
          {pending ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Writing…
            </>
          ) : (
            <>
              <Sparkles size={15} strokeWidth={1.75} /> Generate script
            </>
          )}
        </button>
      </div>
    </section>
  );
}

// ── Result / refine (left, below generator) ──────────────────────────────────
function ResultPanel({
  clientId,
  script,
  onRefined,
}: {
  clientId: string;
  script: ScriptRow;
  onRefined: (row: ScriptRow) => void;
}) {
  const [refinement, setRefinement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run() {
    setError(null);
    if (!refinement.trim()) {
      setError("Add a note on what to change.");
      return;
    }
    start(async () => {
      try {
        const row = await refineScript({ clientId, scriptId: script.id, refinement });
        onRefined(row);
        setRefinement("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Refine failed.");
      }
    });
  }

  return (
    <section className="card border-gold/40 bg-gold-tint/20">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="eyebrow">Latest draft</p>
        <CopyButton text={script.generated_script ?? ""} />
      </div>

      <div className="max-h-[420px] overflow-y-auto rounded-lg border border-line bg-paper p-4">
        <Markdown>{script.generated_script ?? ""}</Markdown>
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-sm text-ink">Refine</label>
        <textarea
          className="input min-h-[64px] resize-y"
          placeholder="e.g. Make the hook punchier. Cut the middle. More casual."
          value={refinement}
          onChange={(e) => setRefinement(e.target.value)}
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button onClick={run} disabled={pending} className="btn-ghost mt-3">
          {pending ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Refining…
            </>
          ) : (
            <>
              <Wand2 size={15} strokeWidth={1.75} /> Refine draft
            </>
          )}
        </button>
      </div>
    </section>
  );
}

// ── Library (right) ──────────────────────────────────────────────────────────
function Library({
  clientId,
  scripts,
  activeId,
  onSelect,
  onStatusChanged,
  onDeleted,
}: {
  clientId: string;
  scripts: ScriptRow[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onStatusChanged: (row: ScriptRow) => void;
  onDeleted: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scripts.filter((s) => {
      if (q && !(s.topic ?? "").toLowerCase().includes(q)) return false;
      if (typeFilter !== "all" && s.content_type !== typeFilter) return false;
      if (statusFilter !== "all" && normalizeStatus(s.status) !== statusFilter)
        return false;
      return true;
    });
  }, [scripts, query, typeFilter, statusFilter]);

  return (
    <section className="card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-ink">Library</h2>
        <span className="text-xs text-ink-soft">{scripts.length} scripts</span>
      </div>

      <div className="mt-4 space-y-3">
        <div className="relative">
          <Search
            size={15}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
          />
          <input
            className="input pl-9"
            placeholder="Search by topic"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <BareSelect value={typeFilter} onChange={setTypeFilter}>
            <option value="all">All types</option>
            {CONTENT_TYPES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </BareSelect>
          <BareSelect value={statusFilter} onChange={setStatusFilter}>
            <option value="all">All statuses</option>
            {STATUSES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </BareSelect>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {filtered.length === 0 ? (
          <p className="rounded-lg border border-line bg-cream/50 px-4 py-8 text-center text-sm text-ink-soft">
            {scripts.length === 0
              ? "No scripts yet. Generate your first one on the left."
              : "No scripts match those filters."}
          </p>
        ) : (
          filtered.map((s) => (
            <ScriptCard
              key={s.id}
              clientId={clientId}
              script={s}
              expanded={s.id === activeId}
              onToggle={() => onSelect(s.id === activeId ? "" : s.id)}
              onStatusChanged={onStatusChanged}
              onDeleted={onDeleted}
            />
          ))
        )}
      </div>
    </section>
  );
}

function ScriptCard({
  clientId,
  script,
  expanded,
  onToggle,
  onStatusChanged,
  onDeleted,
}: {
  clientId: string;
  script: ScriptRow;
  expanded: boolean;
  onToggle: () => void;
  onStatusChanged: (row: ScriptRow) => void;
  onDeleted: (id: string) => void;
}) {
  const [pending, start] = useTransition();
  const status = normalizeStatus(script.status);

  const badges = [
    labelFor(CONTENT_TYPES, script.content_type),
    labelFor(PILLARS, script.pillar),
    labelFor(AUDIENCE_STAGES, script.audience_stage),
  ].filter(Boolean);

  function changeStatus(next: string) {
    start(async () => {
      try {
        await updateScriptStatus(clientId, script.id, next);
        onStatusChanged({ ...script, status: next });
      } catch {
        /* keep prior UI on failure */
      }
    });
  }

  function remove() {
    if (!window.confirm("Delete this script? This can't be undone.")) return;
    start(async () => {
      try {
        await deleteScript(clientId, script.id);
        onDeleted(script.id);
      } catch {
        /* no-op */
      }
    });
  }

  return (
    <div className="rounded-lg border border-line bg-paper">
      <div className="flex items-start gap-3 p-3.5">
        <button
          onClick={onToggle}
          className="min-w-0 flex-1 text-left"
          aria-expanded={expanded}
        >
          <p className="line-clamp-2 text-sm text-ink">{script.topic || "Untitled"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {badges.map((b) => (
              <span
                key={b}
                className="rounded bg-cream px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-soft"
              >
                {b}
              </span>
            ))}
          </div>
        </button>
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          className={`mt-1 shrink-0 text-ink-soft transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-3.5 py-2.5">
        <StatusSelect value={status} disabled={pending} onChange={changeStatus} />
        {expanded && (
          <div className="flex items-center gap-1">
            <CopyButton text={script.generated_script ?? ""} compact />
            <button
              onClick={remove}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-soft transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 size={14} strokeWidth={1.75} /> Delete
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="max-h-[360px] overflow-y-auto border-t border-line p-4">
          <Markdown>{script.generated_script ?? ""}</Markdown>
        </div>
      )}
    </div>
  );
}

// ── Small shared bits ────────────────────────────────────────────────────────
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm text-ink">{label}</label>
      <BareSelect value={value} onChange={onChange}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </BareSelect>
    </div>
  );
}

function BareSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
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
      {children}
    </select>
  );
}

function StatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value)}
      className="cursor-pointer rounded-md border border-line bg-cream px-2 py-1 text-xs font-medium text-ink focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 disabled:opacity-50"
    >
      {STATUSES.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function CopyButton({ text, compact }: { text: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={copy}
      className={
        compact
          ? "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-soft transition-colors hover:bg-cream hover:text-ink"
          : "btn-ghost px-3 py-1.5 text-xs"
      }
    >
      {copied ? (
        <>
          <Check size={14} strokeWidth={2} /> Copied
        </>
      ) : (
        <>
          <Copy size={14} strokeWidth={1.75} /> Copy
        </>
      )}
    </button>
  );
}
