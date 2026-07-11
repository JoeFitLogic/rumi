"use client";

import { useState, useTransition } from "react";
import { Mail, Check, AlertTriangle } from "lucide-react";
import type { AccountStatus } from "@/lib/types";
import { setAccountStatus, resendInvite } from "./actions";

export default function ClientHeaderActions({
  clientId,
  status,
  clientName,
}: {
  clientId: string;
  status: AccountStatus;
  clientName: string;
}) {
  const [current, setCurrent] = useState<AccountStatus>(status);
  const [confirming, setConfirming] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const next: AccountStatus = current === "active" ? "inactive" : "active";

  function applyStatus() {
    setError(null);
    start(async () => {
      try {
        await setAccountStatus(clientId, next);
        setCurrent(next);
        setConfirming(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't update status.");
      }
    });
  }

  function invite() {
    setError(null);
    setInviteMsg(null);
    start(async () => {
      try {
        const res = await resendInvite(clientId);
        setInviteMsg(
          res.inviteSent
            ? "Invite email sent."
            : res.inviteError ?? "Invite could not be sent."
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't resend invite.");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        {/* Account status */}
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            current === "active"
              ? "bg-gold-tint text-gold-deep"
              : "bg-red-50 text-red-700"
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${
              current === "active" ? "bg-gold" : "bg-red-500"
            }`}
          />
          {current === "active" ? "Active" : "Inactive"}
        </span>

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={pending}
            className="btn-ghost px-3 py-1.5 text-xs"
          >
            {current === "active" ? "Deactivate" : "Reactivate"}
          </button>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-md border border-line bg-cream px-2.5 py-1.5 text-xs text-ink">
            {next === "inactive" ? (
              <span className="inline-flex items-center gap-1 text-red-700">
                <AlertTriangle size={12} strokeWidth={2} />
                Lock {clientName} out?
              </span>
            ) : (
              <span>Restore access for {clientName}?</span>
            )}
            <button onClick={applyStatus} disabled={pending} className="font-medium text-gold-deep hover:underline">
              {pending ? "…" : "Confirm"}
            </button>
            <button onClick={() => setConfirming(false)} disabled={pending} className="text-ink-soft hover:underline">
              Cancel
            </button>
          </span>
        )}

        {/* Resend invite */}
        <button onClick={invite} disabled={pending} className="btn-ghost px-3 py-1.5 text-xs">
          <Mail size={13} strokeWidth={1.75} />
          Resend invite
        </button>
      </div>

      {inviteMsg && (
        <span className="inline-flex items-center gap-1.5 text-xs text-gold-deep">
          <Check size={13} strokeWidth={2} /> {inviteMsg}
        </span>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
