export default function AuthShell({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-6">
      <div className="w-full max-w-sm">
        {/* Logo slot — drop a Resonance logo <Image> here; text mark for now.
            "Rumi" stays the product wordmark; Resonance is the company. */}
        <div className="mb-10 text-center">
          <p className="font-display text-3xl font-medium tracking-tight text-ink">
            Rumi
          </p>
          <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-gold-deep">
            by Resonance · Connect. Convert.
          </p>
        </div>
        <div className="card">
          <p className="eyebrow mb-2">{eyebrow}</p>
          <h1 className="mb-6 font-display text-[22px] text-ink">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}
