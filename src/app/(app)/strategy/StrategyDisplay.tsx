"use client";

import { useEffect, useState } from "react";
import Markdown from "@/components/Markdown";

export interface StrategySectionRow {
  id: string;
  section_number: number;
  section_title: string;
  content: string;
}

export default function StrategyDisplay({
  sections,
}: {
  sections: StrategySectionRow[];
}) {
  const [active, setActive] = useState(sections[0]?.section_number ?? 1);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActive(Number(visible[0].target.getAttribute("data-section")));
        }
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    );
    sections.forEach((s) => {
      const el = document.getElementById(`section-${s.section_number}`);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [sections]);

  return (
    <div className="flex gap-10">
      {/* Sticky section nav */}
      <nav className="sticky top-8 hidden h-fit w-56 shrink-0 lg:block">
        <p className="eyebrow mb-3">Sections</p>
        <ol className="space-y-0.5">
          {sections.map((s) => {
            const on = s.section_number === active;
            return (
              <li key={s.id}>
                <a
                  href={`#section-${s.section_number}`}
                  className={`flex gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                    on
                      ? "bg-gold-tint/60 font-medium text-ink"
                      : "text-ink-soft hover:bg-cream hover:text-ink"
                  }`}
                >
                  <span
                    className={`tabular-nums ${on ? "text-gold-deep" : "text-ink-soft/60"}`}
                  >
                    {s.section_number}
                  </span>
                  <span>{s.section_title}</span>
                </a>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Sections */}
      <div className="min-w-0 flex-1">
        {sections.map((s) => (
          <section
            key={s.id}
            id={`section-${s.section_number}`}
            data-section={s.section_number}
            className="mb-14 scroll-mt-8"
          >
            <p className="eyebrow mb-2">Section {s.section_number}</p>
            <h2 className="mb-5 font-display text-[26px] font-medium tracking-tight text-ink">
              {s.section_title}
            </h2>
            <Markdown>{s.content}</Markdown>
          </section>
        ))}
      </div>
    </div>
  );
}
