"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Pencil, Check, Loader2, Send, RotateCcw } from "lucide-react";
import Markdown from "@/components/Markdown";
import { saveSection, releaseNow, regenerate } from "./actions";
import type { StrategySectionRow } from "./StrategyDisplay";

export default function StrategyReview({
  sections,
  strategyId,
  reviewDeadline,
  clientName,
}: {
  sections: StrategySectionRow[];
  strategyId: string;
  reviewDeadline: string | null;
  clientName: string;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [banner, setBanner] = useState<string | null>(null);

  const releaseDate = reviewDeadline
    ? new Date(reviewDeadline).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : null;

  function doRelease() {
    startTransition(async () => {
      const res = await releaseNow(strategyId);
      if (res.released) {
        setBanner(`Released to ${clientName}. They've been emailed.`);
        router.refresh();
      } else {
        setBanner(res.alreadyReleased ? "Already released." : `Not released: ${res.reason}`);
      }
    });
  }

  function doRegenerate() {
    if (
      !window.confirm(
        "Regenerate this strategy? The current 12 sections will be deleted and rebuilt from scratch. This cannot be undone."
      )
    )
      return;
    startTransition(async () => {
      await regenerate(strategyId);
      setBanner("Regenerating — this takes a few minutes. Refresh shortly.");
      router.refresh();
    });
  }

  return (
    <div>
      {/* In-review banner */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gold/40 bg-gold-tint/50 px-5 py-4">
        <div>
          <p className="text-sm font-medium text-ink">
            In review — only you can see this.
          </p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {releaseDate
              ? `Releases to ${clientName} automatically on ${releaseDate} if you don't release it first.`
              : `Release it to ${clientName} when you're happy with it.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={doRegenerate}
            disabled={busy}
            className="btn-ghost"
          >
            <RotateCcw size={15} strokeWidth={1.75} />
            Regenerate
          </button>
          <button onClick={doRelease} disabled={busy} className="btn-primary">
            {busy ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Send size={15} strokeWidth={1.75} />
            )}
            Release now
          </button>
        </div>
      </div>

      {banner && (
        <p className="mb-6 rounded-md border border-line bg-cream px-4 py-2.5 text-sm text-ink">
          {banner}
        </p>
      )}

      <div className="space-y-10">
        {sections.map((s) => (
          <SectionEditor key={s.id} section={s} />
        ))}
      </div>
    </div>
  );
}

function SectionEditor({ section }: { section: StrategySectionRow }) {
  const [value, setValue] = useState(section.content);
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = value !== section.content;

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await saveSection(section.id, value);
      section.content = value; // keep local baseline in sync
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border-b border-line pb-8 last:border-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="eyebrow">Section {section.section_number}</span>
          <h2 className="font-display text-xl font-medium tracking-tight text-ink">
            {section.section_title}
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
            className="btn-ghost px-3 py-1.5 text-xs"
          >
            {mode === "edit" ? (
              <>
                <Eye size={14} strokeWidth={1.75} /> Preview
              </>
            ) : (
              <>
                <Pencil size={14} strokeWidth={1.75} /> Edit
              </>
            )}
          </button>
          {mode === "edit" && (
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="btn-primary px-3 py-1.5 text-xs"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : saved ? (
                <Check size={14} strokeWidth={2} />
              ) : null}
              {saved ? "Saved" : "Save"}
            </button>
          )}
        </div>
      </div>

      {mode === "edit" ? (
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          spellCheck
          className="h-96 w-full resize-y rounded-md border border-line bg-paper p-4 font-mono text-[13px] leading-relaxed text-ink focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
        />
      ) : (
        <Markdown>{value}</Markdown>
      )}
    </section>
  );
}
