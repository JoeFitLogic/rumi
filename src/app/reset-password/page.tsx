"use client";

import { useState } from "react";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { requestPasswordReset } from "./actions";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  // Sends via our own Resend path, not supabase.auth.resetPasswordForEmail --
  // see src/app/reset-password/actions.ts for why. The action always resolves
  // the same way, so there is no error branch to render and no way to tell
  // from this page whether an account exists.
  async function handleReset() {
    setLoading(true);
    await requestPasswordReset(email);
    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <AuthShell eyebrow="Email sent" title="Check your inbox">
        <p className="text-sm text-ink-soft">
          If an account exists for{" "}
          <span className="font-medium text-ink">{email}</span>, a password
          reset link is on its way.
        </p>
        <Link href="/login" className="btn-ghost mt-6 w-full">
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="Reset password" title="Get a reset link">
      <div className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm text-ink">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleReset()}
          />
        </div>

        <button
          onClick={handleReset}
          disabled={loading || !email}
          className="btn-primary w-full"
        >
          {loading ? "Sending…" : "Send reset link"}
        </button>

        <p className="pt-1 text-center text-sm">
          <Link
            href="/login"
            className="text-ink-soft underline-offset-2 hover:text-gold-deep hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
