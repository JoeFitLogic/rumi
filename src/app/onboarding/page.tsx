import type { Metadata } from "next";
import { onboardingKeyConfigured, onboardingKeyMatches } from "@/lib/onboardingKey";
import OnboardingForm from "./OnboardingForm";

// Public intake form — no session required. See src/lib/supabase/middleware.ts,
// where /onboarding is both a PUBLIC_PATH and exempt from the signed-in bounce
// so an admin can open the live form to test it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Identity Foundation Form — Rumi",
  // A shared intake link should never be indexed.
  robots: { index: false, follow: false },
};

function LinkNotValid() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="eyebrow">Rumi by Resonance</p>
      <h1 className="mt-3 font-display text-2xl text-ink">
        This link isn&rsquo;t valid
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        The form link you used is missing its access key or the key has changed.
        Check you copied the whole link, including everything after the{" "}
        <code className="rounded bg-cream px-1 py-0.5 text-[13px]">?</code>. If
        it still doesn&rsquo;t work, ask us for a fresh link.
      </p>
    </main>
  );
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ k?: string }>;
}) {
  const { k } = await searchParams;

  // Fail closed: no key configured on the server means nobody gets the form.
  if (!onboardingKeyConfigured() || !onboardingKeyMatches(k)) {
    return <LinkNotValid />;
  }

  // The key is handed to the client so the form can send it back with the
  // submission, which re-validates it server-side. It is already in the
  // client's URL bar — this exposes nothing new.
  return <OnboardingForm formKey={k as string} />;
}
