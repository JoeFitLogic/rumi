"use client";

import { useState, useTransition } from "react";
import { Check, Instagram, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateDisplayName } from "./actions";

// ── Profile: edit display name, email read-only ──────────────────────────
export function ProfilePanel({
  initialName,
  email,
}: {
  initialName: string;
  email: string | null;
}) {
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = name.trim() !== initialName.trim() && name.trim().length > 0;

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      try {
        await updateDisplayName(name);
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  return (
    <section className="card">
      <h2 className="font-display text-lg text-ink">Profile</h2>
      <p className="mt-1 text-sm text-ink-soft">Your name as it appears across Rumi.</p>

      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm text-ink">
            Display name
          </label>
          <input
            id="name"
            className="input max-w-sm"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-ink">Email</label>
          <input className="input max-w-sm opacity-70" value={email ?? ""} readOnly disabled />
          <p className="mt-1.5 text-xs text-ink-soft">
            Contact your coach to change your email.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3">
          <button onClick={save} disabled={!dirty || pending} className="btn-primary">
            {pending ? "Saving…" : "Save"}
          </button>
          {saved && !dirty && (
            <span className="inline-flex items-center gap-1.5 text-sm text-gold-deep">
              <Check size={15} strokeWidth={2} /> Saved
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Security: change password with current-password re-auth ──────────────
export function SecurityPanel({ email }: { email: string | null }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    setDone(false);
    if (!email) {
      setError("No email on this account — contact your coach.");
      return;
    }
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    start(async () => {
      const supabase = createClient();
      // 1. Re-authenticate with the CURRENT password before allowing a change.
      const { error: reauthErr } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (reauthErr) {
        setError("Current password is incorrect.");
        return;
      }
      // 2. Set the new password.
      const { error: updErr } = await supabase.auth.updateUser({ password: next });
      if (updErr) {
        setError(updErr.message);
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    });
  }

  return (
    <section className="card">
      <h2 className="font-display text-lg text-ink">Security</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Change your password. You&apos;ll need your current one to confirm it&apos;s you.
      </p>

      <div className="mt-5 max-w-sm space-y-4">
        <Field label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
        <Field label="New password" value={next} onChange={setNext} autoComplete="new-password" />
        <Field label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={pending || !current || !next || !confirm}
            className="btn-primary"
          >
            <Lock size={15} strokeWidth={1.75} />
            {pending ? "Updating…" : "Update password"}
          </button>
          {done && (
            <span className="inline-flex items-center gap-1.5 text-sm text-gold-deep">
              <Check size={15} strokeWidth={2} /> Password updated
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm text-ink">{label}</label>
      <input
        type="password"
        autoComplete={autoComplete}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ── Integrations: labelled seam only, no OAuth ───────────────────────────
export function IntegrationsPanel() {
  return (
    <section className="card">
      <h2 className="font-display text-lg text-ink">Integrations</h2>
      <p className="mt-1 text-sm text-ink-soft">Connect the tools you post from.</p>

      <div className="mt-5 flex items-center justify-between rounded-lg border border-line bg-cream/50 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-gold-tint text-gold-deep">
            <Instagram size={18} strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-sm font-medium text-ink">Instagram</p>
            <p className="text-xs text-ink-soft">Pull your posts and performance in automatically.</p>
          </div>
        </div>
        <span className="rounded bg-cream px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-ink-soft">
          Coming soon
        </span>
      </div>
    </section>
  );
}
