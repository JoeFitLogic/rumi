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
        <p className="mb-10 text-center font-display text-3xl font-medium tracking-tight text-ink">
          Rumi
        </p>
        <div className="card">
          <p className="eyebrow mb-2">{eyebrow}</p>
          <h1 className="mb-6 font-display text-[22px] text-ink">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}
