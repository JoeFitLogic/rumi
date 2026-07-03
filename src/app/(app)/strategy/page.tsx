import PageHeader from "@/components/PageHeader";

// Phase 2: 12-section strategy display, generated via server action
// calling Anthropic directly (replaces the n8n Part A / Part B flow).
export default function StrategyPage() {
  return (
    <div>
      <PageHeader
        eyebrow="My Strategy"
        title="Your content strategy"
        description="Your 12-section personal brand strategy, built from your onboarding answers."
      />
      <div className="card">
        <p className="text-sm text-ink-soft">
          Your strategy will appear here once it has been generated.
        </p>
      </div>
    </div>
  );
}
