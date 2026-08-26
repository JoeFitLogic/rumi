"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  Sparkles,
  Loader2,
  Wand2,
  Copy,
  Check,
  Trash2,
  ChevronDown,
  ChevronLeft,
  RefreshCw,
  PenLine,
  Search,
  AlertTriangle,
} from "lucide-react";
import Markdown from "@/components/Markdown";
import {
  CONTENT_TYPES,
  ALL_CONTENT_TYPES,
  PILLARS,
  ALL_PILLARS,
  LEGACY_AUDIENCE_STAGES,
  LENGTHS,
  STATUSES,
  HOOK_COUNT,
  normalizeStatus,
  labelFor,
  type ScriptRow,
} from "@/lib/scripts";
import {
  generateHooks,
  generateScript,
  refineScript,
  updateScriptStatus,
  deleteScript,
} from "./actions";
import ContentBank from "./ContentBank";
import type { ContentIdeaRow } from "@/lib/contentBank";

type View = "ideas" | "scripts";

export default function ScriptStudio({
  clientId,
  isAdmin,
  hasVoice,
  clientFirstName,
  initialScripts,
  initialIdeas,
  prefillTopic,
}: {
  clientId: string;
  isAdmin: boolean;
  hasVoice: boolean;
  clientFirstName: string;
  initialScripts: ScriptRow[];
  initialIdeas: ContentIdeaRow[];
  prefillTopic: string;
}) {
  const [scripts, setScripts] = useState<ScriptRow[]>(initialScripts);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Topic lives here so "Write script" from an idea can prefill the generator.
  const [topic, setTopic] = useState(prefillTopic);
  const [view, setView] = useState<View>(
    prefillTopic ? "scripts" : initialIdeas.length > 0 ? "ideas" : "scripts"
  );

  const active = scripts.find((s) => s.id === activeId) ?? null;
  // Step 2 renders ten hooks, so a fresh draft lands well below the fold. Bring
  // it into view rather than leaving the client staring at the list they just
  // picked from.
  const draftRef = useRef<HTMLDivElement>(null);

  function upsert(row: ScriptRow) {
    setScripts((prev) => {
      const without = prev.filter((s) => s.id !== row.id);
      return [row, ...without];
    });
  }

  function writeScriptFrom(idea: ContentIdeaRow) {
    setTopic(idea.hook?.trim() || idea.title);
    setView("scripts");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-6">
      <ViewToggle
        view={view}
        onChange={setView}
        ideaCount={initialIdeas.length}
        scriptCount={scripts.length}
      />

      {view === "ideas" ? (
        <ContentBank
          clientId={clientId}
          initialIdeas={initialIdeas}
          onWriteScript={writeScriptFrom}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Generator
              clientId={clientId}
              isAdmin={isAdmin}
              hasVoice={hasVoice}
              clientFirstName={clientFirstName}
              topic={topic}
              setTopic={setTopic}
              onGenerated={(row) => {
                upsert(row);
                setActiveId(row.id);
                requestAnimationFrame(() =>
                  draftRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                );
              }}
            />
            {active && (
              <div ref={draftRef} className="scroll-mt-6">
                <ResultPanel
                  key={active.id}
                  clientId={clientId}
                  script={active}
                  onRefined={(row) => upsert(row)}
                />
              </div>
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
      )}
    </div>
  );
}

// ── Ideas / Scripts segmented switch ─────────────────────────────────────────
function ViewToggle({
  view,
  onChange,
  ideaCount,
  scriptCount,
}: {
  view: View;
  onChange: (v: View) => void;
  ideaCount: number;
  scriptCount: number;
}) {
  const tabs: { key: View; label: string; count: number }[] = [
    { key: "ideas", label: "Content Bank", count: ideaCount },
    { key: "scripts", label: "Script Studio", count: scriptCount },
  ];
  return (
    <div className="inline-flex rounded-lg border border-line bg-cream/50 p-1">
      {tabs.map((t) => {
        const isActive = t.key === view;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm transition-colors ${
              isActive
                ? "bg-paper font-medium text-ink shadow-sm"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            {t.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                isActive ? "bg-gold-tint text-gold-deep" : "bg-cream text-ink-soft"
              }`}
            >
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Generator (left) ───────────────────────────────────────────────────────
//
// Two steps, because the client picks a written hook rather than a hook *type*:
//   1. brief  — topic, format, pillar, length, optional context → "Generate hooks"
//   2. hooks  — ten hooks in their voice, pick ONE → the script is written to it
// The brief survives a trip back and forth, so re-running hooks after a tweak is
// cheap. Only step 2's "Write the script" writes a row.
type Step = "brief" | "hooks";

function Generator({
  clientId,
  isAdmin,
  hasVoice,
  clientFirstName,
  topic,
  setTopic,
  onGenerated,
}: {
  clientId: string;
  isAdmin: boolean;
  hasVoice: boolean;
  clientFirstName: string;
  topic: string;
  setTopic: (v: string) => void;
  onGenerated: (row: ScriptRow) => void;
}) {
  const [contentType, setContentType] = useState(CONTENT_TYPES[0].value);
  const [pillar, setPillar] = useState(PILLARS[0].value); // connect
  const [length, setLength] = useState(LENGTHS[1].value); // 60s
  const [additionalContext, setAdditionalContext] = useState("");

  const [step, setStep] = useState<Step>("brief");
  const [hooks, setHooks] = useState<string[]>([]);
  const [chosenHook, setChosenHook] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ctDesc = CONTENT_TYPES.find((c) => c.value === contentType)?.description;
  const pillarDesc = PILLARS.find((p) => p.value === pillar)?.description;

  function runHooks() {
    setError(null);
    if (!topic.trim()) {
      setError("Add a topic first.");
      return;
    }
    start(async () => {
      try {
        const list = await generateHooks({
          clientId,
          topic,
          contentType,
          pillar,
          additionalContext,
        });
        setHooks(list);
        setChosenHook(null);
        setStep("hooks");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't write the hooks.");
      }
    });
  }

  function runScript() {
    setError(null);
    if (!chosenHook) {
      setError("Pick a hook first.");
      return;
    }
    start(async () => {
      try {
        const row = await generateScript({
          clientId,
          topic,
          contentType,
          pillar,
          length,
          chosenHook,
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
      <StepHeader step={step} />

      {isAdmin && !hasVoice && (
        <div className="mt-4 flex gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
          <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
          <span>
            No voice sample yet — hooks and scripts will sound more generic. Add a{" "}
            <span className="font-medium">voice transcript</span> to{" "}
            {clientFirstName}&apos;s onboarding to match how they actually speak.
          </span>
        </div>
      )}

      {step === "brief" ? (
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
            <div>
              <Select label="Pillar" value={pillar} onChange={setPillar} options={PILLARS} />
              {pillarDesc && <p className="mt-1.5 text-xs text-ink-soft">{pillarDesc}</p>}
            </div>
            <Select label="Length" value={length} onChange={setLength} options={LENGTHS} />
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

          <div className="flex flex-wrap items-center gap-3">
            <button onClick={runHooks} disabled={pending} className="btn-primary">
              {pending ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Writing hooks…
                </>
              ) : (
                <>
                  <Sparkles size={15} strokeWidth={1.75} /> Generate hooks
                </>
              )}
            </button>
            {hooks.length > 0 && !pending && (
              <button onClick={() => setStep("hooks")} className="btn-ghost">
                Back to your {hooks.length} hooks
              </button>
            )}
          </div>
        </div>
      ) : (
        <HookPicker
          hooks={hooks}
          chosenHook={chosenHook}
          onChoose={setChosenHook}
          pending={pending}
          error={error}
          onBack={() => {
            setError(null);
            setStep("brief");
          }}
          onRegenerate={runHooks}
          onWrite={runScript}
        />
      )}
    </section>
  );
}

function StepHeader({ step }: { step: Step }) {
  const steps: { key: Step; n: number; label: string }[] = [
    { key: "brief", n: 1, label: "Your brief" },
    { key: "hooks", n: 2, label: "Pick a hook" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          {i > 0 && <span className="text-ink-soft">/</span>}
          <span
            className={`flex items-center gap-1.5 text-sm ${
              s.key === step ? "font-medium text-ink" : "text-ink-soft"
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                s.key === step ? "bg-gold-tint text-gold-deep" : "bg-cream text-ink-soft"
              }`}
            >
              {s.n}
            </span>
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Step 2: the ten hooks ────────────────────────────────────────────────────
function HookPicker({
  hooks,
  chosenHook,
  onChoose,
  pending,
  error,
  onBack,
  onRegenerate,
  onWrite,
}: {
  hooks: string[];
  chosenHook: string | null;
  onChoose: (h: string) => void;
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onRegenerate: () => void;
  onWrite: () => void;
}) {
  return (
    <div className="mt-5 space-y-4">
      <p className="text-sm text-ink-soft">
        {hooks.length === HOOK_COUNT
          ? `${HOOK_COUNT} hooks, written in your voice.`
          : `${hooks.length} hooks, written in your voice.`}{" "}
        Pick the one you&apos;d actually say out loud. Rumi writes the rest of the
        script to that angle.
      </p>

      <ul className="space-y-2">
        {hooks.map((hook, i) => {
          const selected = hook === chosenHook;
          return (
            <li key={`${i}-${hook}`}>
              <button
                onClick={() => onChoose(hook)}
                aria-pressed={selected}
                disabled={pending}
                className={`flex w-full items-start gap-3 rounded-lg border p-3.5 text-left transition-colors disabled:opacity-60 ${
                  selected
                    ? "border-gold bg-gold-tint/40"
                    : "border-line bg-paper hover:border-gold/50 hover:bg-cream/50"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    selected ? "bg-gold text-white" : "bg-cream text-ink-soft"
                  }`}
                >
                  {selected ? <Check size={12} strokeWidth={3} /> : i + 1}
                </span>
                <span className="text-sm leading-relaxed text-ink">{hook}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onWrite} disabled={pending || !chosenHook} className="btn-primary">
          {pending ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Working…
            </>
          ) : (
            <>
              <PenLine size={15} strokeWidth={1.75} /> Write the script
            </>
          )}
        </button>
        <button onClick={onRegenerate} disabled={pending} className="btn-ghost">
          <RefreshCw size={15} strokeWidth={1.75} /> New hooks
        </button>
        <button onClick={onBack} disabled={pending} className="btn-ghost">
          <ChevronLeft size={15} strokeWidth={1.75} /> Change brief
        </button>
      </div>
    </div>
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
            {ALL_CONTENT_TYPES.map((o) => (
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

  // ALL_* / LEGACY_* lists, not the picker lists: 1900 Cleo rows carry retired
  // content types, pillars and audience stages, and they still need a label.
  const badges = [
    labelFor(ALL_CONTENT_TYPES, script.content_type),
    labelFor(ALL_PILLARS, script.pillar),
    labelFor(LEGACY_AUDIENCE_STAGES, script.audience_stage),
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
