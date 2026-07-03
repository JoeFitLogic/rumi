"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AuthShell from "@/components/AuthShell";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSignup() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
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
      <AuthShell eyebrow="One more step" title="Check your email">
        <p className="text-sm text-ink-soft">
          A confirmation link is on its way to{" "}
          <span className="font-medium text-ink">{email}</span>. Open it to
          finish creating your account.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="New here" title="Create your account">
      <div className="space-y-4">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm text-ink">
            Full name
          </label>
          <input
            id="name"
            className="input"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
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
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm text-ink">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-ink-soft">
            At least 8 characters.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={handleSignup}
          disabled={loading || !name || !email || password.length < 8}
          className="btn-primary w-full"
        >
          {loading ? "Creating account…" : "Create account"}
        </button>

        <p className="pt-1 text-center text-sm text-ink-soft">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-gold-deep underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
