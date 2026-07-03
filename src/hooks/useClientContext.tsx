"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Profile } from "@/lib/types";

interface ClientContextValue {
  viewer: Profile;
  activeClientId: string;
  activeClient: Profile;
  isImpersonating: boolean;
}

const ClientContext = createContext<ClientContextValue | null>(null);

export function ClientContextProvider({
  value,
  children,
}: {
  value: ClientContextValue;
  children: ReactNode;
}) {
  return (
    <ClientContext.Provider value={value}>{children}</ClientContext.Provider>
  );
}

/**
 * Returns the active client context anywhere in the app shell.
 * All client-side data fetching should use `activeClientId`, and every
 * server action call should pass it as the clientId parameter (the
 * server re-validates admin permission via getActiveClient).
 */
export function useClientContext(): ClientContextValue {
  const ctx = useContext(ClientContext);
  if (!ctx) {
    throw new Error(
      "useClientContext must be used inside ClientContextProvider"
    );
  }
  return ctx;
}
