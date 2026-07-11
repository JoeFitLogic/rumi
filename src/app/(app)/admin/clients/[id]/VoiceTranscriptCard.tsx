"use client";

import { useState, useTransition } from "react";
import { Mic, Check } from "lucide-react";
import { saveVoiceTranscript } from "./actions";

export default function VoiceTranscriptCard({
  onboardingId,
  clientId,
  initialValue,
}: {
  onboardingId: string;
  clientId: string;
  initialValue: string;
}) {
  const [baseline, setBaseline] = useState(initialValue);
  const [text, setText] = useState(initialValue);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dirty = text.trim() !== baseline.trim();
  const filled = baseline.trim().length > 0;

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      try {
        await saveVoiceTranscript(onboardingId, clientId, text);
        setBaseline(text.trim());
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  return (
    <section className="card border-gold/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-gold-tint text-gold-deep">
            <Mic size={18} strokeWidth={1.75} />
          </span>
          <h2 className="font-display text-lg text-ink">Voice sample</h2>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            filled ? "bg-gold-tint text-gold-deep" : "bg-cream text-ink-soft"
          }`}
        >
          {filled ? "On file" : "Empty"}
        </span>
      </div>

      <p className="mt-3 text-sm text-ink-soft">
        Paste 2–3 minutes of the client talking naturally — a voice-note transcript
        or a call excerpt. Generation uses this to match how they actually speak, so
        scripts and strategy sound like them, not like AI.
      </p>

      <textarea
        className="input mt-4 min-h-[220px] resize-y leading-relaxed"
        placeholder="Paste the transcript here…"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
      />

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={!dirty || pending} className="btn-primary">
          {pending ? "Saving…" : "Save voice sample"}
        </button>
        {saved && !dirty && (
          <span className="inline-flex items-center gap-1.5 text-sm text-gold-deep">
            <Check size={15} strokeWidth={2} /> Saved
          </span>
        )}
      </div>
    </section>
  );
}
