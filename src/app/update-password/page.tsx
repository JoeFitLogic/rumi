"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthShell from "@/components/AuthShell";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleUpdate() {
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AuthShell eyebrow="Almost there" title="Set a new password">
      <div className="space-y-4">
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm text-ink">
            New password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="confirm" className="mb-1.5 block text-sm text-ink">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={handleUpdate}
          disabled={loading || password.length < 8 || !confirm}
          className="btn-primary w-full"
        >
          {loading ? "Saving…" : "Save new password"}
        </button>
      </div>
    </AuthShell>
  );
}
