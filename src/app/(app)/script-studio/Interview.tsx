"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Send, RotateCcw, Save, Sparkles, AlertTriangle } from "lucide-react";
import Markdown from "@/components/Markdown";
import {
  STORY_TYPES,
  extractScript,
  replyWithoutScript,
  extractImf,
  deriveTopic,
  detectStoryType,
  type InterviewMessage,
} from "@/lib/interview";
import { interviewTurn, saveInterviewScript } from "./interviewActions";
import type { ScriptRow } from "@/lib/scripts";

// Interview mode — Rumi interviews the client one question at a time, extracts a
// real story, locks the IMF, then writes the script.
//
// The thread lives here in component state and is mirrored to localStorage per
// client, so a refresh mid-interview doesn't lose it. Nothing is written to the
// database until the client saves the finished script — the conversation is
// working material, the script is the artefact.

const storageKey = (clientId: string) => `rumi:interview:v1:${clientId}`;

export default function Interview({
  clientId,
  clientFirstName,
  hasVoice,
  onSaved,
}: {
  clientId: string;
  clientFirstName: string;
  hasVoice: boolean;
  onSaved: (row: ScriptRow) => void;
}) {
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [pending, startTurn] = useTransition();
  const [saving, startSave] = useTransition();
  const hydrated = useRef(false);
  const threadEnd = useRef<HTMLDivElement>(null);

  // ── Load / persist the thread for this client ─────────────────────────────
  useEffect(() => {
    hydrated.current = false;
    try {
      const raw = localStorage.getItem(storageKey(clientId));
      const parsed = raw ? (JSON.parse(raw) as InterviewMessage[]) : [];
      setMessages(Array.isArray(parsed) ? parsed : []);
    } catch {
      setMessages([]);
    }
    setSavedId(null);
    setError(null);
    hydrated.current = true;
  }, [clientId]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(storageKey(clientId), JSON.stringify(messages));
    } catch {
      /* localStorage full or unavailable — non-fatal */
    }
  }, [clientId, messages]);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  // The last assistant message is the only one that can carry a finished script.
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const finished = lastAssistant ? extractScript(lastAssistant.content) : null;
  const script = finished?.script ?? null;

  function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;
    const next: InterviewMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setDraft("");
    setError(null);
    runTurn(next);
  }

  function runTurn(thread: InterviewMessage[]) {
    startTurn(async () => {
      try {
        const res = await interviewTurn({ clientId, messages: thread });
        setMessages([...thread, { role: "assistant", content: res.reply }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Rumi couldn't reply. Try again.");
      }
    });
  }

  function restart() {
    if (messages.length > 0 && !window.confirm("Start a new interview? This thread is cleared."))
      return;
    setMessages([]);
    setSavedId(null);
    setError(null);
  }

  function save() {
    if (!script || !lastAssistant) return;
    startSave(async () => {
      try {
        const row = await saveInterviewScript({
          clientId,
          script,
          topic: deriveTopic(lastAssistant.content, script),
          storyType: detectStoryType(messages),
          imf: extractImf(lastAssistant.content),
        });
        setSavedId(row.id);
        onSaved(row);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save the script.");
      }
    });
  }

  const empty = messages.length === 0;

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg text-ink">Interview</h2>
            <p className="mt-1 max-w-lg text-sm text-ink-soft">
              Rumi asks one question at a time, digs until there&rsquo;s a real
              moment in it, then writes the script from your own words. Slower
              than the form, and the scripts are better.
            </p>
          </div>
          {!empty && (
            <button onClick={restart} disabled={pending || saving} className="btn-ghost shrink-0">
              <RotateCcw size={15} strokeWidth={1.75} />
              New interview
            </button>
          )}
        </div>

        {!hasVoice && (
          <p className="flex gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
            <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
            <span>
              No voice sample on file for {clientFirstName}, so the script will be
              written from their onboarding answers alone. It&rsquo;ll sound less
              like them than it could.
            </span>
          </p>
        )}

        {empty ? (
          <StartPanel onPick={send} onOpen={() => runTurn([])} pending={pending} />
        ) : (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {messages.map((m, i) => (
              <Bubble key={i} message={m} />
            ))}
            {pending && (
              <div className="flex items-center gap-2 text-sm text-ink-soft">
                <Loader2 size={15} className="animate-spin" /> Rumi is thinking&hellip;
              </div>
            )}
            <div ref={threadEnd} />
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {error}
          </p>
        )}

        {!empty && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex items-end gap-2"
          >
            <textarea
              className="input min-h-[76px] flex-1 resize-y"
              placeholder="Your answer. The more specific, the better the script."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter is a newline — these answers are
                // often several sentences, so the newline has to stay reachable.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              disabled={pending}
            />
            <button
              type="submit"
              disabled={pending || !draft.trim()}
              className="btn-primary shrink-0"
            >
              {pending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Send size={15} strokeWidth={1.75} />
              )}
              Send
            </button>
          </form>
        )}
      </div>

      {script && (
        <div className="card space-y-3 border-gold/40 bg-gold-tint/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 font-display text-base text-ink">
              <Sparkles size={16} strokeWidth={1.75} className="text-gold" /> Your script
            </h3>
            <button onClick={save} disabled={saving || !!savedId} className="btn-primary">
              {saving ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Save size={15} strokeWidth={1.75} />
              )}
              {savedId ? "Saved to library" : "Save to library"}
            </button>
          </div>
          {finished?.markersMissing && (
            <p className="text-xs text-ink-soft">
              Rumi didn&rsquo;t close the script cleanly, so this is everything
              after the opening marker. Worth a read before you save it.
            </p>
          )}
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{script}</div>
        </div>
      )}
    </div>
  );
}

// ── The opening screen: pick a type, or just let Rumi ask ────────────────────
function StartPanel({
  onPick,
  onOpen,
  pending,
}: {
  onPick: (text: string) => void;
  onOpen: () => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        Pick the kind of story you want to tell, or start and Rumi will ask.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {STORY_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => onPick(`I want to do ${t}.`)}
            disabled={pending}
            className="rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs text-ink-soft transition-colors hover:border-gold/50 hover:text-ink disabled:opacity-50"
          >
            {t}
          </button>
        ))}
      </div>
      <button onClick={onOpen} disabled={pending} className="btn-ghost">
        {pending ? <Loader2 size={15} className="animate-spin" /> : null}
        I&rsquo;m not sure &mdash; ask me
      </button>
    </div>
  );
}

function Bubble({ message }: { message: InterviewMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-gold-tint/60 px-3.5 py-2.5 text-sm text-ink">
          {message.content}
        </div>
      </div>
    );
  }
  // The script block is rendered in its own panel below the thread, so the
  // bubble shows the question or the IMF and leaves the script out.
  const text = replyWithoutScript(message.content);
  if (!text) return null;
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-lg rounded-bl-sm border border-line bg-cream/40 px-3.5 py-2.5 text-sm text-ink">
        <Markdown>{text}</Markdown>
      </div>
    </div>
  );
}
