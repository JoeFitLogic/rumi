"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  ClipboardCheck,
  Telescope,
  PenLine,
  MessageCircle,
  HeartPulse,
} from "lucide-react";
import { useClientContext } from "@/hooks/useClientContext";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/strategy", label: "My Strategy", icon: BookOpen },
  { href: "/check-in", label: "Check In", icon: ClipboardCheck },
  { href: "/research", label: "Research", icon: Telescope },
  { href: "/script-studio", label: "Script Studio", icon: PenLine },
  { href: "/chat", label: "Chat", icon: MessageCircle, comingSoon: true },
  {
    href: "/admin",
    label: "Client Health & Admin",
    icon: HeartPulse,
    adminOnly: true,
  },
] as const;

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { viewer } = useClientContext();
  const asParam = searchParams.get("as");

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-line bg-paper">
      <div className="px-6 pb-6 pt-7">
        <Link href="/dashboard" className="block">
          {/* Logo pending — text mark for now */}
          <span className="font-display text-[26px] font-medium tracking-tight text-ink">
            Rumi
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((item) => {
          if ("adminOnly" in item && item.adminOnly && viewer.role !== "admin")
            return null;

          const active = pathname.startsWith(item.href);
          const comingSoon = "comingSoon" in item && item.comingSoon;
          const Icon = item.icon;
          // Preserve the admin switcher context across navigation
          const href =
            asParam && !comingSoon ? `${item.href}?as=${asParam}` : item.href;

          if (comingSoon) {
            return (
              <div
                key={item.href}
                aria-disabled
                className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2.5 text-sm text-ink-soft/50"
              >
                <Icon size={17} strokeWidth={1.75} />
                <span>{item.label}</span>
                <span className="ml-auto rounded bg-cream px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-soft/70">
                  Soon
                </span>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={href}
              className={`relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-gold-tint/60 font-medium text-ink"
                  : "text-ink-soft hover:bg-cream hover:text-ink"
              }`}
            >
              {/* Signature: gold hairline marks the active page */}
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-gold" />
              )}
              <Icon
                size={17}
                strokeWidth={1.75}
                className={active ? "text-gold-deep" : undefined}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line px-6 py-4">
        <p className="text-xs text-ink-soft">
          Signed in as{" "}
          <span className="font-medium text-ink">
            {viewer.name ?? viewer.email}
          </span>
        </p>
      </div>
    </aside>
  );
}
