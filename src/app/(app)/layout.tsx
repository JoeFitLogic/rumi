import { redirect } from "next/navigation";
import { Suspense } from "react";
import { headers } from "next/headers";
import { getActiveClient } from "@/lib/activeClient";
import { ClientContextProvider } from "@/hooks/useClientContext";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Layouts don't receive searchParams, so read ?as= from the request URL
  // forwarded by middleware. Pages/server actions re-resolve via
  // getActiveClient(asParam) themselves — this is only for the shell.
  const headerList = await headers();
  const url = headerList.get("x-url") ?? "";
  const asParam = url ? new URL(url).searchParams.get("as") : null;

  const ctx = await getActiveClient(asParam);
  if (!ctx) redirect("/login");

  // Soft-disabled accounts see a locked page
  if (ctx.viewer.account_status === "inactive") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cream px-6">
        <div className="card max-w-md text-center">
          <p className="eyebrow mb-3">Account locked</p>
          <h1 className="font-display text-2xl text-ink">
            Your Rumi account is inactive
          </h1>
          <p className="mt-3 text-sm text-ink-soft">
            Get in touch with your coach to restore access.
          </p>
        </div>
      </main>
    );
  }

  return (
    <ClientContextProvider
      value={{
        viewer: ctx.viewer,
        activeClientId: ctx.activeClientId,
        activeClient: ctx.activeClient,
        isImpersonating: ctx.isImpersonating,
      }}
    >
      <div className="flex h-screen overflow-hidden bg-cream/40">
        <Suspense>
          <Sidebar />
        </Suspense>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 overflow-y-auto px-8 py-8">{children}</main>
        </div>
      </div>
    </ClientContextProvider>
  );
}
