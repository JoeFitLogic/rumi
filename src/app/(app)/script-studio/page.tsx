import PageHeader from "@/components/PageHeader";

// Phase 2: combined generator (left) + saved library (right),
// reprompt support, status tracking idea → drafted → filmed → published.
export default function ScriptStudioPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Script Studio"
        title="Write scripts in your voice"
        description="Generate, refine, and organise your content scripts in one place."
      />
      <div className="card">
        <p className="text-sm text-ink-soft">
          Script Studio is coming in the next build phase.
        </p>
      </div>
    </div>
  );
}
