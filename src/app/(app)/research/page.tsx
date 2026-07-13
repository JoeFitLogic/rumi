import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { getActiveClient } from "@/lib/activeClient";
import Research from "./Research";

// Research — the 5-step flow that replaces Cleo's Ideation tab:
//   1. Your analytics   2. Client interactions (+ transcript analyser)
//   3. External forums (Reddit scraper)   4. Ideation   5. Hooks & formats
// Scoped to the active client via getActiveClient() + the admin ?as= switcher.
// Per-client progress is persisted in localStorage, keyed by activeClientId.
export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const asParam = typeof params.as === "string" ? params.as : null;

  const ctx = await getActiveClient(asParam);
  if (!ctx) redirect("/login");

  return (
    <div>
      <PageHeader
        eyebrow="Research"
        title="Find what your audience wants"
        description="Work through your analytics, client conversations, and audience research to surface winning topics."
      />
      <Research clientId={ctx.activeClientId} />
    </div>
  );
}
