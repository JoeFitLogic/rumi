"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthShell from "@/components/AuthShell";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push(searchParams.get("next") ?? "/dashboard");
    router.refresh();
  }

  return (
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
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm text-ink">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={handleLogin}
        disabled={loading || !email || !password}
        className="btn-primary w-full"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>

      <div className="flex items-center pt-1 text-sm">
        <Link
          href="/reset-password"
          className="text-ink-soft underline-offset-2 hover:text-gold-deep hover:underline"
        >
          Forgot password?
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthShell eyebrow="Welcome back" title="Sign in to Rumi">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
