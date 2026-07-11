"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check } from "lucide-react";
import type { OnboardingGroup } from "@/lib/onboarding";
import { saveOnboardingSection } from "./actions";

interface Field {
  column: string;
  label: string;
  value: string;
}
interface Group {
  group: OnboardingGroup;
  fields: Field[];
}

export default function OnboardingEditor({
  onboardingId,
  clientId,
  groups,
}: {
  onboardingId: string;
  clientId: string;
  groups: Group[];
}) {
  // baseline = last saved values; draft = current edits. Both keyed by column.
  const flat = Object.fromEntries(
    groups.flatMap((g) => g.fields.map((f) => [f.column, f.value]))
  ) as Record<string, string>;
  const [baseline, setBaseline] = useState<Record<string, string>>(flat);
  const [draft, setDraft] = useState<Record<string, string>>(flat);
  const [savingGroup, setSavingGroup] = useState<string | null>(null);
  const [savedGroup, setSavedGroup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function isDirty(g: Group) {
    return g.fields.some((f) => (draft[f.column] ?? "") !== (baseline[f.column] ?? ""));
  }

  function saveGroup(g: Group) {
    setError(null);
    setSavedGroup(null);
    setSavingGroup(g.group);
    const patch: Record<string, string | null> = {};
    for (const f of g.fields) {
      const v = (draft[f.column] ?? "").trim();
      patch[f.column] = v.length > 0 ? v : null;
    }
    start(async () => {
      try {
        await saveOnboardingSection(onboardingId, clientId, patch);
        setBaseline((b) => ({ ...b, ...Object.fromEntries(g.fields.map((f) => [f.column, (draft[f.column] ?? "").trim()])) }));
        setSavedGroup(g.group);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      } finally {
        setSavingGroup(null);
      }
    });
  }

  return (
    <section className="card">
      <h2 className="font-display text-lg text-ink">Onboarding answers</h2>

      <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-gold/30 bg-gold-tint/40 px-3.5 py-3 text-sm text-ink">
        <AlertTriangle size={16} strokeWidth={1.9} className="mt-0.5 shrink-0 text-gold-deep" />
        <p>
          These answers feed strategy and script generation. Edits here change what
          the AI produces for this client — save deliberately.
        </p>
      </div>

      <div className="mt-6 space-y-8">
        {groups.map((g) => {
          const dirty = isDirty(g);
          return (
            <div key={g.group}>
              <div className="mb-3 flex items-center justify-between">
                <p className="eyebrow">{g.group}</p>
                <div className="flex items-center gap-2">
                  {savedGroup === g.group && !dirty && (
                    <span className="inline-flex items-center gap-1 text-xs text-gold-deep">
                      <Check size={13} strokeWidth={2} /> Saved
                    </span>
                  )}
                  <button
                    onClick={() => saveGroup(g)}
                    disabled={!dirty || pending}
                    className="btn-ghost px-3 py-1.5 text-xs"
                  >
                    {savingGroup === g.group ? "Saving…" : "Save section"}
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {g.fields.map((f) => (
                  <div key={f.column}>
                    <label className="mb-1.5 block text-xs font-medium text-ink-soft">
                      {f.label}
                    </label>
                    <textarea
                      className="input min-h-[64px] resize-y leading-relaxed"
                      value={draft[f.column] ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, [f.column]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </section>
  );
}
