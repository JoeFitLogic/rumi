"use client";

import { useState, useTransition } from "react";
import { UserPlus, Link2, Unlink, Check } from "lucide-react";
import { linkVa, unlinkVa, createVaForClient } from "./actions";

interface VaRef {
  id: string;
  name: string | null;
  email: string | null;
}

export default function VaPanel({
  clientId,
  linkedVas,
  availableVas,
}: {
  clientId: string;
  linkedVas: VaRef[];
  availableVas: VaRef[]; // role='va' not already linked to this client
}) {
  const [selected, setSelected] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<unknown>, ok?: string) {
    setError(null);
    setMsg(null);
    start(async () => {
      try {
        await fn();
        if (ok) setMsg(ok);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <section className="card">
      <h2 className="font-display text-lg text-ink">Virtual assistant</h2>
      <p className="mt-1 text-sm text-ink-soft">
        VAs can act on this client&apos;s behalf across Rumi.
      </p>

      {/* Currently linked */}
      <div className="mt-5 space-y-2">
        {linkedVas.length === 0 ? (
          <p className="text-sm text-ink-soft">No VA assigned.</p>
        ) : (
          linkedVas.map((va) => (
            <div
              key={va.id}
              className="flex items-center justify-between rounded-lg border border-line bg-cream/50 px-3.5 py-2.5"
            >
              <div>
                <p className="text-sm font-medium text-ink">{va.name ?? "Unnamed VA"}</p>
                {va.email && <p className="text-xs text-ink-soft">{va.email}</p>}
              </div>
              <button
                onClick={() => run(() => unlinkVa(va.id, clientId))}
                disabled={pending}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                <Unlink size={13} strokeWidth={1.75} />
                Unlink
              </button>
            </div>
          ))
        )}
      </div>

      {/* Assign an existing VA */}
      {availableVas.length > 0 && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1.5 block text-xs font-medium text-ink-soft">
              Assign an existing VA
            </label>
            <select
              className="input"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Select a VA…</option>
              {availableVas.map((va) => (
                <option key={va.id} value={va.id}>
                  {va.name ?? va.email ?? va.id}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => selected && run(() => linkVa(selected, clientId), "VA linked.")}
            disabled={pending || !selected}
            className="btn-primary py-2.5 text-sm"
          >
            <Link2 size={14} strokeWidth={1.75} />
            Link
          </button>
        </div>
      )}

      {/* Create a new VA */}
      <div className="mt-4 border-t border-line pt-4">
        {!showCreate ? (
          <button onClick={() => setShowCreate(true)} className="btn-ghost text-sm">
            <UserPlus size={14} strokeWidth={1.75} />
            Create a VA account
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium text-ink">New VA account</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className="input"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className="input"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <p className="text-xs text-ink-soft">
              They&apos;ll be created as a VA linked to this client and emailed a set-password link.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  run(async () => {
                    const res = await createVaForClient(email, name, clientId);
                    setShowCreate(false);
                    setEmail("");
                    setName("");
                    return res;
                  }, "VA account created and linked.")
                }
                disabled={pending || !email.trim() || !name.trim()}
                className="btn-primary text-sm"
              >
                {pending ? "Creating…" : "Create & link"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                disabled={pending}
                className="btn-ghost text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {msg && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-gold-deep">
          <Check size={14} strokeWidth={2} /> {msg}
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}
