"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useClientContext } from "@/hooks/useClientContext";
import ClientSwitcher from "@/components/ClientSwitcher";

export default function TopBar() {
  const router = useRouter();
  const { viewer, activeClient, isImpersonating } = useClientContext();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-line bg-paper px-8">
      <div className="flex items-center gap-4">
        {isImpersonating && (
          <span className="rounded-full bg-gold-tint px-3 py-1 text-xs font-medium text-gold-deep">
            Viewing {activeClient.name ?? activeClient.email}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {viewer.role === "admin" && <ClientSwitcher />}
        <button
          onClick={signOut}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-cream hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
        >
          <LogOut size={15} strokeWidth={1.75} />
          Sign out
        </button>
      </div>
    </header>
  );
}
