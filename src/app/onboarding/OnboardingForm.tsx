"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2, AlertTriangle } from "lucide-react";
import {
  FORM_COLUMNS,
  FORM_PARTS,
  PART_INTROS,
  questionsForPart,
  type OnboardingInput,
  type OnboardingPart,
} from "@/lib/onboarding";
import { submitOnboardingForm } from "./actions";

// ── local draft storage ──────────────────────────────────────────────────
// Save-as-you-go, keyed by email, so progress survives a refresh or closing
// the tab. Deliberately browser-only: no server-side partial saves, so an
// abandoned form never creates an account or a half-row in a Cleo-shared
// table, and nothing is written anywhere until the client presses Submit.
// The trade-off is that progress does not follow them to another device.

const NS = "rumi.onboarding.v1";
const ANON = "__anon";

interface Draft {
  name: string;
  email: string;
  answers: Record<string, string>;
  step: number;
  savedAt: number;
}

/** Every localStorage access is wrapped: it throws outright in some privacy
 *  modes, and a form that loses its answers is worse than one that can't save. */
function safeRead<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function safeWrite(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
function safeRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

const draftsKey = () => `${NS}.drafts`;
const lastKey = () => `${NS}.last`;
const slot = (email: string) => (email.trim() ? email.trim().toLowerCase() : ANON);

function readDrafts(): Record<string, Draft> {
  return safeRead<Record<string, Draft>>(draftsKey()) ?? {};
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOTAL_QUESTIONS = FORM_PARTS.reduce(
  (n, p) => n + questionsForPart(p).length,
  0
);

// ── auto-growing textarea ────────────────────────────────────────────────
function AutoTextarea({
  id,
  value,
  onChange,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  describedBy?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 96)}px`;
  }, []);
  useEffect(resize, [resize, value]);
  return (
    <textarea
      id={id}
      ref={ref}
      value={value}
      aria-describedby={describedBy}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      className="input resize-none leading-relaxed"
    />
  );
}

// ── one input box ────────────────────────────────────────────────────────
function Field({
  field,
  value,
  onChange,
  describedBy,
  showLabel,
}: {
  field: OnboardingInput;
  value: string;
  onChange: (v: string) => void;
  describedBy?: string;
  showLabel: boolean;
}) {
  const id = `f-${field.column}`;

  const label = showLabel ? (
    <label
      htmlFor={id}
      className="mb-1.5 block text-[13px] font-medium text-ink-soft"
    >
      {field.label}
    </label>
  ) : null;

  if (field.input === "checkboxes") {
    const selected = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const toggle = (opt: string) => {
      const next = selected.includes(opt)
        ? selected.filter((s) => s !== opt)
        : [...selected, opt];
      // Stored comma-joined, matching how `platforms` is read today.
      onChange(next.join(", "));
    };
    return (
      <fieldset>
        {showLabel && (
          <legend className="mb-1.5 text-[13px] font-medium text-ink-soft">
            {field.label}
          </legend>
        )}
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((opt) => {
            const on = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(opt)}
                className={
                  "rounded-full border px-4 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold " +
                  (on
                    ? "border-gold bg-gold-tint font-medium text-gold-deep"
                    : "border-line bg-paper text-ink-soft hover:border-gold hover:text-gold-deep")
                }
              >
                {on && <Check className="mr-1 inline h-3.5 w-3.5" aria-hidden />}
                {opt}
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (field.input === "select") {
    return (
      <div>
        {label}
        <select
          id={id}
          value={value}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className="input"
        >
          <option value="">Choose one…</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.input === "text") {
    return (
      <div>
        {label}
        <input
          id={id}
          type="text"
          value={value}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className="input"
        />
      </div>
    );
  }

  return (
    <div>
      {label}
      <AutoTextarea id={id} value={value} onChange={onChange} describedBy={describedBy} />
    </div>
  );
}

// ── the form ─────────────────────────────────────────────────────────────
export default function OnboardingForm({ formKey }: { formKey: string }) {
  const REVIEW_STEP = FORM_PARTS.length;

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [storageBroken, setStorageBroken] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [offerRestore, setOfferRestore] = useState<Draft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { deduped: boolean; inviteSent: boolean }>(null);

  const topRef = useRef<HTMLDivElement>(null);
  /** The slot the current state was loaded from / is being written to. */
  const slotRef = useRef<string>(ANON);

  // ── restore on mount ───────────────────────────────────────────────────
  useEffect(() => {
    const last = safeRead<string>(lastKey());
    const drafts = readDrafts();
    const d = last ? drafts[last] : null;
    if (d) {
      setName(d.name ?? "");
      setEmail(d.email ?? "");
      setAnswers(d.answers ?? {});
      setStep(Math.min(d.step ?? 0, REVIEW_STEP));
      setSavedAt(d.savedAt ?? null);
      slotRef.current = last as string;
    }
    setHydrated(true);
  }, [REVIEW_STEP]);

  // ── save on change (debounced) ─────────────────────────────────────────
  useEffect(() => {
    if (!hydrated || done) return;
    const t = setTimeout(() => {
      const target = slot(email);
      const drafts = readDrafts();
      // Moving from the anonymous slot to a real email: carry the draft over
      // and drop the placeholder so it can't be restored on top of someone else.
      if (slotRef.current === ANON && target !== ANON) delete drafts[ANON];
      drafts[target] = { name, email, answers, step, savedAt: Date.now() };
      const ok = safeWrite(draftsKey(), drafts) && safeWrite(lastKey(), target);
      slotRef.current = target;
      if (ok) setSavedAt(Date.now());
      else setStorageBroken(true);
    }, 400);
    return () => clearTimeout(t);
  }, [hydrated, done, name, email, answers, step]);

  // ── a different email with its own saved draft ─────────────────────────
  const maybeOfferRestore = useCallback(
    (candidate: string) => {
      const target = slot(candidate);
      if (target === ANON || target === slotRef.current) return;
      const d = readDrafts()[target];
      if (!d) return;
      const answered = Object.values(d.answers ?? {}).filter((v) => v?.trim()).length;
      if (answered === 0) return;
      setOfferRestore(d);
    },
    []
  );

  function applyRestore(d: Draft) {
    setName(d.name ?? "");
    setEmail(d.email ?? "");
    setAnswers(d.answers ?? {});
    setStep(Math.min(d.step ?? 0, REVIEW_STEP));
    slotRef.current = slot(d.email ?? "");
    setOfferRestore(null);
  }

  const setAnswer = useCallback((column: string, value: string) => {
    setAnswers((a) => ({ ...a, [column]: value }));
  }, []);

  const answeredCount = useMemo(
    () =>
      FORM_PARTS.reduce(
        (n, p) =>
          n +
          questionsForPart(p).filter((q) =>
            q.fields.some((f) => (answers[f.column] ?? "").trim().length > 0)
          ).length,
        0
      ),
    [answers]
  );

  function goto(next: number) {
    setStep(next);
    // The parts are long; land the client at the top of the new one.
    requestAnimationFrame(() =>
      topRef.current?.scrollIntoView({ block: "start", behavior: "auto" })
    );
  }

  function next() {
    if (step === 0) {
      const e: typeof errors = {};
      if (!name.trim()) e.name = "We need your name.";
      if (!EMAIL_RE.test(email.trim())) e.email = "We need a valid email address.";
      setErrors(e);
      if (Object.keys(e).length > 0) return;
    }
    goto(Math.min(step + 1, REVIEW_STEP));
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await submitOnboardingForm({ key: formKey, name, email, answers });
      if (res.status === "error") {
        setSubmitError(res.message);
        return;
      }
      // Only clear the local draft once the server has it.
      const drafts = readDrafts();
      delete drafts[slotRef.current];
      safeWrite(draftsKey(), drafts);
      safeRemove(lastKey());
      setDone({ deduped: res.deduped, inviteSent: res.inviteSent });
      requestAnimationFrame(() =>
        topRef.current?.scrollIntoView({ block: "start", behavior: "auto" })
      );
    } catch {
      setSubmitError(
        "Couldn't reach the server. Your answers are still saved in this browser — please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Avoid a flash of empty fields before the draft is read.
  if (!hydrated) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6">
        <Loader2 className="h-5 w-5 animate-spin text-gold" aria-label="Loading" />
      </main>
    );
  }

  if (done) {
    return (
      <main ref={topRef} className="mx-auto max-w-lg px-6 py-20">
        <div className="card text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-gold-tint">
            <Check className="h-5 w-5 text-gold-deep" aria-hidden />
          </div>
          <h1 className="mt-5 font-display text-2xl text-ink">That&rsquo;s it — thank you.</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Your answers are in. We&rsquo;re building your strategy from them now.
          </p>
          {done.inviteSent ? (
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              Check <strong className="text-ink">{email}</strong> for an email to
              set your password — that&rsquo;s how you get into Rumi. If it
              isn&rsquo;t there in a few minutes, check your spam folder.
            </p>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              We couldn&rsquo;t send your login email just now, but your answers
              are safely saved. We&rsquo;ll get your access sorted and be in
              touch at <strong className="text-ink">{email}</strong>.
            </p>
          )}
          {done.deduped && (
            <p className="mt-4 rounded-md bg-cream px-3 py-2 text-[13px] leading-relaxed text-ink-soft">
              We already had a submission in progress for this email, so we
              haven&rsquo;t started a second one.
            </p>
          )}
        </div>
      </main>
    );
  }

  const isReview = step === REVIEW_STEP;
  const part = FORM_PARTS[step] as OnboardingPart | undefined;
  const progress = Math.round((step / REVIEW_STEP) * 100);

  return (
    <main className="min-h-screen bg-paper pb-24">
      {/* progress bar */}
      <div className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-6 py-3">
          <div className="flex items-baseline justify-between gap-4">
            <p className="eyebrow">
              {isReview ? "Review" : `Part ${step + 1} of ${FORM_PARTS.length}`}
            </p>
            <p className="text-[11px] tabular-nums text-ink-soft">
              {answeredCount}/{TOTAL_QUESTIONS} answered
              {savedAt && !storageBroken && (
                <span className="ml-2 text-gold-deep">Saved</span>
              )}
            </p>
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-cream">
            <div
              className="h-full rounded-full bg-gold transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div ref={topRef} className="mx-auto max-w-2xl px-6 pt-10">
        {storageBroken && (
          <p className="mb-6 flex gap-2 rounded-md border border-rag-amber/40 bg-gold-tint px-3.5 py-2.5 text-[13px] leading-relaxed text-ink">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rag-amber-deep" aria-hidden />
            <span>
              This browser won&rsquo;t let us save your progress, so don&rsquo;t
              close the tab before you submit. Private browsing usually causes
              this.
            </span>
          </p>
        )}

        {offerRestore && (
          <div className="mb-6 rounded-md border border-line bg-cream px-4 py-3">
            <p className="text-[13px] leading-relaxed text-ink">
              We found saved answers for that email on this device. Pick them up
              where you left off?
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="btn-primary !py-1.5 !text-[13px]"
                onClick={() => applyRestore(offerRestore)}
              >
                Restore my answers
              </button>
              <button
                type="button"
                className="btn-ghost !py-1.5 !text-[13px]"
                onClick={() => setOfferRestore(null)}
              >
                Start fresh
              </button>
            </div>
          </div>
        )}

        {step === 0 && <Intro />}

        {isReview ? (
          <Review
            name={name}
            email={email}
            answers={answers}
            answeredCount={answeredCount}
            onEdit={goto}
          />
        ) : (
          part && (
            <section>
              <h1 className="font-display text-[26px] leading-tight text-ink">
                {titleCase(part)}
              </h1>
              {PART_INTROS[part] && (
                <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
                  {PART_INTROS[part]}
                </p>
              )}

              <div className="mt-8 flex flex-col gap-9">
                {step === 0 && (
                  <>
                    <div>
                      <label
                        htmlFor="full-name"
                        className="block text-[15px] font-medium text-ink"
                      >
                        Full Name
                      </label>
                      <input
                        id="full-name"
                        type="text"
                        value={name}
                        autoComplete="name"
                        onChange={(e) => {
                          setName(e.target.value);
                          if (errors.name) setErrors((x) => ({ ...x, name: undefined }));
                        }}
                        className="input mt-2"
                      />
                      {errors.name && (
                        <p className="mt-1.5 text-[13px] text-rag-red-deep">{errors.name}</p>
                      )}
                    </div>
                    <div>
                      <label
                        htmlFor="email"
                        className="block text-[15px] font-medium text-ink"
                      >
                        Email
                      </label>
                      <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                        This is the address we&rsquo;ll use to set up your Rumi
                        login, so use the one you actually check.
                      </p>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        autoComplete="email"
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (errors.email) setErrors((x) => ({ ...x, email: undefined }));
                        }}
                        onBlur={(e) => maybeOfferRestore(e.target.value)}
                        className="input mt-2"
                      />
                      {errors.email && (
                        <p className="mt-1.5 text-[13px] text-rag-red-deep">{errors.email}</p>
                      )}
                    </div>
                  </>
                )}

                {questionsForPart(part).map((q) => {
                  const helperId = `h-${q.fields[0].column}`;
                  return (
                    <div key={q.question}>
                      <p className="text-[15px] font-medium leading-snug text-ink">
                        {q.question}
                      </p>
                      {q.helper && (
                        <p
                          id={helperId}
                          className="mt-1.5 text-[13px] leading-relaxed text-ink-soft"
                        >
                          {q.helper}
                        </p>
                      )}
                      <div className="mt-3 flex flex-col gap-4">
                        {q.fields.map((f) => (
                          <Field
                            key={f.column}
                            field={f}
                            value={answers[f.column] ?? ""}
                            onChange={(v) => setAnswer(f.column, v)}
                            describedBy={q.helper ? helperId : undefined}
                            showLabel={q.fields.length > 1}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )
        )}

        {submitError && (
          <p className="mt-8 flex gap-2 rounded-md border border-rag-red/40 bg-rag-red/5 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rag-red-deep" aria-hidden />
            <span>{submitError}</span>
          </p>
        )}

        {/* nav */}
        <div className="mt-12 flex items-center justify-between gap-4 border-t border-line pt-6">
          <button
            type="button"
            onClick={() => goto(Math.max(step - 1, 0))}
            disabled={step === 0 || submitting}
            className="btn-ghost disabled:invisible"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </button>

          {isReview ? (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Sending…
                </>
              ) : (
                <>Submit my answers</>
              )}
            </button>
          ) : (
            <button type="button" onClick={next} className="btn-primary">
              {step === FORM_PARTS.length - 1 ? "Review my answers" : "Continue"}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>

        <p className="mt-6 text-center text-[12px] leading-relaxed text-ink-soft">
          Your progress saves in this browser as you go, so you can close the tab
          and come back. It won&rsquo;t follow you to another device — finish on
          the one you started on.
        </p>
      </div>
    </main>
  );
}

// ── the form's front matter, from the PDF ────────────────────────────────
// Verbatim from the revised form, including the spelling. The one line left
// out is "When you're done, send this back to us directly" -- it is a PDF
// instruction, and this form has a Submit button.
function Intro() {
  return (
    <div className="mb-10 border-b border-line pb-10">
      <p className="eyebrow">Resonance</p>
      <h1 className="mt-3 font-display text-[30px] leading-tight text-ink">
        Identity Foundation Form
      </h1>
      <p className="mt-4 text-[13px] font-medium uppercase tracking-wider text-gold-deep">
        New Resonance Members · Set aside 3&ndash;4 hours · This is where
        everything starts
      </p>
      <div className="mt-5 flex flex-col gap-3 text-[14px] leading-relaxed text-ink-soft">
        <p>
          Ladies and Gentlemennnnn, now THIS, THIS RIGHT HERE, will be the
          foundation of your entire brand and every building block required to
          make you undeniable.
        </p>
        <p>
          Every single script, video, DM, call, lead magnet, offer, it all
          traces back to exactly what you write here.
        </p>
        <p>
          So please do not be shy, the more honest you are, the more REAL we
          get, the better your content gets as a byproduct. And on the contrary?
          If you want surface level results, then you should bottle everything
          up and keep it generic. (how stupid does that sound right??)
        </p>
        <p>
          So please, everything that you write here feeds directly into your
          personalised strategy, Rumi, your research, and your content plan.
        </p>
        <p>
          Gonna need all the juicy little details from you. Shallow answers mean
          a bot that sounds like everyone else. Honest answers means a fkin
          undeniable personal brand with content that sounds like you and
          attracts the people you ACTUALLY want.
        </p>
        <p>
          Please I HIGHLY ADVISE, to use &ldquo;wispr&rdquo; or any transcription
          app to make things go faster. However you do it just make sure the
          detail is there.
        </p>
        <p className="text-ink">
          <strong className="font-semibold">
            Now remember the ONLY RULE: be honest, not impressive.
          </strong>{" "}
          The polished version of your story is what people scroll past. The
          real version is what makes them stop. The people who go deep here see
          results fastest.
        </p>
      </div>
    </div>
  );
}

// ── review step ──────────────────────────────────────────────────────────
function Review({
  name,
  email,
  answers,
  answeredCount,
  onEdit,
}: {
  name: string;
  email: string;
  answers: Record<string, string>;
  answeredCount: number;
  onEdit: (step: number) => void;
}) {
  const thin = answeredCount < 15;
  return (
    <section>
      <h1 className="font-display text-[26px] leading-tight text-ink">
        Check it over
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
        You&rsquo;ve answered {answeredCount} of {TOTAL_QUESTIONS}. Nothing is
        sent until you press submit — go back and add to anything that feels
        thin.
      </p>

      {thin && (
        <p className="mt-5 flex gap-2 rounded-md border border-rag-amber/40 bg-gold-tint px-3.5 py-2.5 text-[13px] leading-relaxed text-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rag-amber-deep" aria-hidden />
          <span>
            That&rsquo;s not many answers yet. You can still submit, but your
            strategy will be built from thin material — the parts about your
            story, your voice and your ideal client are the ones that make the
            biggest difference.
          </span>
        </p>
      )}

      <dl className="mt-8 flex flex-col gap-2 rounded-lg border border-line bg-cream px-4 py-3 text-[14px]">
        <div className="flex gap-3">
          <dt className="w-16 shrink-0 text-ink-soft">Name</dt>
          <dd className="text-ink">{name || "—"}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-16 shrink-0 text-ink-soft">Email</dt>
          <dd className="break-all text-ink">{email || "—"}</dd>
        </div>
      </dl>

      <div className="mt-8 flex flex-col gap-8">
        {FORM_PARTS.map((p, i) => {
          const qs = questionsForPart(p);
          const filled = qs.filter((q) =>
            q.fields.some((f) => (answers[f.column] ?? "").trim().length > 0)
          ).length;
          return (
            <div key={p}>
              <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
                <h2 className="font-display text-[17px] text-ink">
                  {titleCase(p)}
                </h2>
                <div className="flex items-baseline gap-3">
                  <span className="text-[11px] tabular-nums text-ink-soft">
                    {filled}/{qs.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => onEdit(i)}
                    className="text-[13px] font-medium text-gold-deep underline underline-offset-2 hover:text-gold"
                  >
                    Edit
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-3">
                {qs.map((q) =>
                  q.fields.map((f) => {
                    const v = (answers[f.column] ?? "").trim();
                    if (!v) return null;
                    return (
                      <div key={f.column}>
                        <p className="text-[12px] font-medium uppercase tracking-wide text-ink-soft">
                          {f.label}
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
                          {v}
                        </p>
                      </div>
                    );
                  })
                )}
                {filled === 0 && (
                  <p className="text-[13px] italic text-ink-soft">
                    Nothing answered in this part yet.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** "WHERE YOUR BRAND IS NOW" → "Where Your Brand Is Now" */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Referenced so the allowlist and the rendered form can never silently diverge:
// every column the form renders must be one the server action accepts.
if (process.env.NODE_ENV !== "production") {
  const rendered = new Set(
    FORM_PARTS.flatMap((p) => questionsForPart(p).flatMap((q) => q.fields.map((f) => f.column)))
  );
  const allowed = new Set(FORM_COLUMNS);
  for (const c of rendered) {
    if (!allowed.has(c)) console.error(`[onboarding] rendered column not allowlisted: ${c}`);
  }
}
