"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AuthShell from "@/components/AuthShell";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleReset() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
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

        {error && <p className="text-sm text-red-600">{error}</p>}

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
