import { Instagram, Lock } from "lucide-react";

/**
 * Connect Instagram CTA.
 *
 * The button is a deliberate placeholder — the OAuth flow is being proven
 * separately and wires in later. This is the seam: when it lands, swap the
 * disabled button for the link/action that starts the flow and drop the
 * "Coming soon" pill. Nothing else on the page needs to change.
 *
 * Visual language matches the existing Instagram seams in Research and
 * Settings (dashed border, gold-tint icon chip, "Coming soon" pill) so the
 * three read as one pending integration rather than three separate ideas.
 */
export default function ConnectInstagramCard() {
  return (
    <section className="card mb-6 border-dashed bg-cream/40">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gold-tint text-gold-deep">
            <Instagram size={18} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base text-ink">Connect Instagram</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-cream px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-soft">
                <Lock size={10} strokeWidth={2} /> Coming soon
              </span>
            </div>
            <p className="mt-1 max-w-lg text-sm text-ink-soft">
              Connect once and Rumi pulls your followers, reach, engagement and
              top posts automatically — no manual reporting. Until then, every
              number on this page stays empty rather than estimated.
            </p>
          </div>
        </div>

        {/* Placeholder — the OAuth flow wires in here later. */}
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="btn-primary shrink-0 self-start sm:self-auto"
        >
          <Instagram size={16} strokeWidth={1.75} />
          Connect Instagram
        </button>
      </div>
    </section>
  );
}
