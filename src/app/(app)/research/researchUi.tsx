"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";

// Shared UI primitives for the /research step panels.

export function StepIntro({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div>
      <p className="eyebrow mb-1.5">{eyebrow}</p>
      <h2 className="font-display text-xl text-ink">{title}</h2>
      {description && (
        <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">{description}</p>
      )}
      {children}
    </div>
  );
}

export function NotesTextarea({
  label,
  hint,
  value,
  onChange,
  placeholder,
  minH = "min-h-[130px]",
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minH?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
      {hint && <p className="mb-2 text-xs text-ink-soft">{hint}</p>}
      <textarea
        className={`input resize-y ${minH}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function SelectableCard({
  selected,
  onToggle,
  children,
}: {
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={`flex w-full items-start gap-3 rounded-lg border p-3.5 text-left transition-colors ${
        selected
          ? "border-gold bg-gold-tint/40"
          : "border-line bg-paper hover:border-gold/50"
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
          selected ? "border-gold bg-gold text-white" : "border-line bg-paper"
        }`}
      >
        {selected && <Check size={12} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-cream px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-soft">
      {children}
    </span>
  );
}
