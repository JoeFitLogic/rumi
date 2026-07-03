export default function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-8">
      <p className="eyebrow mb-1.5">{eyebrow}</p>
      <h1 className="font-display text-[28px] font-medium tracking-tight text-ink">
        {title}
      </h1>
      {description && (
        <p className="mt-2 max-w-xl text-sm text-ink-soft">{description}</p>
      )}
    </div>
  );
}
