"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useClientContext } from "@/hooks/useClientContext";
import type { Profile } from "@/lib/types";

export default function ClientSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { activeClient, isImpersonating } = useClientContext();

  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<Profile[]>([]);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || clients.length > 0) return;
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("*")
      .eq("role", "client")
      .order("name", { ascending: true })
      .then(({ data }) => setClients((data as Profile[]) ?? []));
  }, [open, clients.length]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function switchTo(clientId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (clientId) params.set("as", clientId);
    else params.delete("as");
    router.push(`${pathname}${params.size ? `?${params}` : ""}`);
    router.refresh();
    setOpen(false);
  }

  const filtered = query
    ? clients.filter((c) =>
        `${c.name ?? ""} ${c.email ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase())
      )
    : clients;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-ink transition-colors hover:border-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
      >
        <Users size={15} strokeWidth={1.75} className="text-gold-deep" />
        {isImpersonating
          ? (activeClient.name ?? activeClient.email)
          : "View as client"}
        <ChevronDown size={14} strokeWidth={2} className="text-ink-soft" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-lg border border-line bg-paper shadow-card">
          <div className="border-b border-line p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients"
              className="input py-2"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {isImpersonating && (
              <button
                onClick={() => switchTo(null)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-gold-deep hover:bg-gold-tint/50"
              >
                <X size={14} strokeWidth={2} />
                Back to my view
              </button>
            )}
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => switchTo(c.id)}
                className="block w-full rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-cream"
              >
                <span className="block">{c.name ?? "Unnamed"}</span>
                <span className="block text-xs text-ink-soft">{c.email}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-ink-soft">
                No clients found.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
