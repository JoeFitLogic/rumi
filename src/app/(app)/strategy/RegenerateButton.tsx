"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Loader2 } from "lucide-react";
import { regenerate } from "./actions";

export default function RegenerateButton({ strategyId }: { strategyId: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();

  function run() {
    if (!window.confirm("Regenerate this strategy from scratch?")) return;
    start(async () => {
      await regenerate(strategyId);
      router.refresh();
    });
  }

  return (
    <button onClick={run} disabled={busy} className="btn-primary">
      {busy ? (
        <Loader2 size={15} className="animate-spin" />
      ) : (
        <RotateCcw size={15} strokeWidth={1.75} />
      )}
      Regenerate
    </button>
  );
}
