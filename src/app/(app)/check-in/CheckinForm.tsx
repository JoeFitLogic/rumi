"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Check, Loader2, Pencil } from "lucide-react";
import {
  SECTIONS,
  fieldsFor,
  emptyValues,
  rowToValues,
  weekLabel,
  STUCK_OPTIONS,
  type CheckinField,
  type CheckinRow,
  type FormValues,
} from "@/lib/checkin";
import { submitCheckin } from "./actions";

export default function CheckinForm({
  clientId,
  currentWeek,
  existing,
  onSaved,
}: {
  clientId: string;
  currentWeek: string;
  existing: CheckinRow | null;
  onSaved: (row: CheckinRow) => void;
}) {
  const draftKey = `rumi:checkin-draft:${clientId}:${currentWeek}`;
  const initial = existing ? rowToValues(existing) : emptyValues();

  const [values, setValues] = useState<FormValues>(initial);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const hydrated = useRef(false);

  // Load any saved draft AFTER mount (keeps SSR + first client render identical).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) setValues({ ...emptyValues(), ...(JSON.parse(raw) as FormValues) });
    } catch {
      /* ignore malformed draft */
    }
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // Persist the draft on every change (only after the initial load has run).
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(values));
    } catch {
      /* storage full / unavailable — non-fatal */
    }
  }, [values, draftKey]);

  function set(column: string, value: FormValues[string]) {
    setValues((v) => ({ ...v, [column]: value }));
  }

  const lastStep = SECTIONS.length - 1;
  const section = SECTIONS[step];

  function submit() {
    setError(null);
    start(async () => {
      try {
        const row = await submitCheckin({ clientId, weekStarting: currentWeek, values });
        try {
          localStorage.removeItem(draftKey);
        } catch {
          /* ignore */
        }
        onSaved(row);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save your check-in.");
      }
    });
  }

  return (
    <div className="card max-w-2xl">
      {/* Header: week + editing state */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow mb-1">Week of {weekLabel(currentWeek)}</p>
          <h2 className="font-display text-lg text-ink">{section}</h2>
        </div>
        {existing && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-tint px-3 py-1 text-xs font-medium text-gold-deep">
            <Pencil size={12} strokeWidth={2} /> Editing this week
          </span>
        )}
      </div>

      {/* Progress */}
      <div className="mt-4 flex items-center gap-2">
        {SECTIONS.map((s, i) => (
          <button
            key={s}
            onClick={() => setStep(i)}
            className="group flex-1"
            aria-label={`Go to ${s}`}
            aria-current={i === step}
          >
            <span
              className={`block h-1.5 rounded-full transition-colors ${
                i <= step ? "bg-gold" : "bg-line group-hover:bg-gold/40"
              }`}
            />
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        Step {step + 1} of {SECTIONS.length}
      </p>

      {/* Fields for the current section */}
      <div className="mt-6 space-y-6">
        {fieldsFor(section).map((f) => (
          <Field key={f.column} field={f} values={values} set={set} />
        ))}
      </div>

      {error && <p className="mt-5 text-sm text-red-600">{error}</p>}

      {/* Nav */}
      <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={15} strokeWidth={1.75} /> Back
        </button>

        {step < lastStep ? (
          <button onClick={() => setStep((s) => Math.min(lastStep, s + 1))} className="btn-primary">
            Next <ChevronRight size={15} strokeWidth={1.75} />
          </button>
        ) : (
          <button onClick={submit} disabled={pending} className="btn-primary">
            {pending ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Check size={15} strokeWidth={2} /> {existing ? "Update check-in" : "Submit check-in"}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Field renderers ──────────────────────────────────────────────────────────
function Field({
  field,
  values,
  set,
}: {
  field: CheckinField;
  values: FormValues;
  set: (column: string, value: FormValues[string]) => void;
}) {
  const v = values[field.column];

  if (field.kind === "slider") {
    const n = typeof v === "number" ? v : Number(v) || 5;
    return (
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <label className="text-sm text-ink">{field.label}</label>
          <span className="font-display text-lg tabular-nums text-gold-deep">{n}</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={n}
          onChange={(e) => set(field.column, Number(e.target.value))}
          className="w-full accent-gold"
        />
        <div className="mt-1 flex justify-between text-[10px] text-ink-soft">
          <span>1</span>
          <span>10</span>
        </div>
      </div>
    );
  }

  if (field.kind === "multiselect") {
    const selected = Array.isArray(v) ? v : [];
    function toggle(opt: string) {
      set(field.column, selected.includes(opt) ? selected.filter((x) => x !== opt) : [...selected, opt]);
    }
    return (
      <div>
        <label className="mb-2 block text-sm text-ink">{field.label}</label>
        <div className="grid gap-2 sm:grid-cols-2">
          {STUCK_OPTIONS.map((opt) => {
            const on = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  on ? "border-gold bg-gold-tint/50 text-ink" : "border-line bg-paper text-ink-soft hover:border-gold/50"
                }`}
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                    on ? "border-gold bg-gold text-white" : "border-line"
                  }`}
                >
                  {on && <Check size={11} strokeWidth={3} />}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (field.kind === "int" || field.kind === "money") {
    return (
      <div>
        <label className="mb-1.5 block text-sm text-ink">{field.label}</label>
        <div className="relative max-w-[220px]">
          {field.kind === "money" && (
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-soft">£</span>
          )}
          <input
            type="number"
            inputMode={field.kind === "money" ? "decimal" : "numeric"}
            min={0}
            step={field.kind === "money" ? "0.01" : "1"}
            className={`input ${field.kind === "money" ? "pl-7" : ""}`}
            placeholder="0"
            value={typeof v === "string" ? v : ""}
            onChange={(e) => set(field.column, e.target.value)}
          />
        </div>
        {field.note && (
          <div className="mt-2.5">
            <textarea
              className="input min-h-[56px] resize-y"
              placeholder="If none (or worth noting), why?"
              value={typeof values[`${field.column}_note`] === "string" ? (values[`${field.column}_note`] as string) : ""}
              onChange={(e) => set(`${field.column}_note`, e.target.value)}
            />
          </div>
        )}
      </div>
    );
  }

  // text / longtext
  return (
    <div>
      <label className="mb-1.5 block text-sm text-ink">{field.label}</label>
      <textarea
        className={`input resize-y ${field.kind === "longtext" ? "min-h-[90px]" : "min-h-[56px]"}`}
        placeholder="Your answer…"
        value={typeof v === "string" ? v : ""}
        onChange={(e) => set(field.column, e.target.value)}
      />
    </div>
  );
}
