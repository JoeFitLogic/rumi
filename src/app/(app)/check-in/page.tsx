import PageHeader from "@/components/PageHeader";

// Phase 3: weekly check-in form (Business Health / Content / Mindset /
// Feedback) + results dashboard with weekly, monthly, all-time views.
export default function CheckInPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Check In"
        title="Weekly check-in"
        description="Log your week — business numbers, content wins, and how you're actually doing."
      />
      <div className="card">
        <p className="text-sm text-ink-soft">
          The weekly check-in form is coming in the next build phase.
        </p>
      </div>
    </div>
  );
}
