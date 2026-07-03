import PageHeader from "@/components/PageHeader";

// Phase 3: 5-step research flow — analytics, client interactions,
// external forums (Reddit scraper), ideation, hooks & formats.
// Competitor research embedded here (SMAI pipeline stays as is).
export default function ResearchPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Research"
        title="Find what your audience wants"
        description="Work through your analytics, client conversations, and audience research to surface winning topics."
      />
      <div className="card">
        <p className="text-sm text-ink-soft">
          The five-step research flow is coming in the next build phase.
        </p>
      </div>
    </div>
  );
}
