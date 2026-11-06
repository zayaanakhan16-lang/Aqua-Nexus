"use client";

/**
 * Application shell.
 *
 * A slim top bar carrying the brand, the utility destinations that are not part
 * of the analysis workflow, and live backend status. There is deliberately no
 * sidebar and no row of primary tabs: the AgriSense shell puts *no* navigation
 * in the header at all, and lets the workspace own it.
 *
 * Workspace navigation therefore lives entirely inside the workspace itself:
 * `MapAnalyticsToggle` switches mode, and `IntelligenceTabs` carries the section
 * chip row. Keeping the header free of tabs is what stops the two levels from
 * duplicating each other and gives the map the full width.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, FileText, Globe2 } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BrandLockup } from "@/components/brand/Brand";
import { StatusDot } from "@/components/ui/primitives";
import { AppProviders } from "@/components/shell/AppProviders";

/**
 * Secondary destinations.
 *
 * These are real surfaces with no place among the eight primary workflow tabs:
 * saved investigations, the report centre and the global (location-independent)
 * view. They are icon-only so they read as utilities rather than a ninth,
 * tenth and eleventh primary tab.
 */
const UTILITY_LINKS = [
  { href: "/study-areas", label: "Saved investigations", icon: Bookmark },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/global", label: "Global intelligence", icon: Globe2 },
] as const;

function UtilityLinks() {
  const pathname = usePathname();
  return (
    <ul className="flex shrink-0 items-center gap-0.5">
      {UTILITY_LINKS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              title={item.label}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                active
                  ? "bg-water-300/[0.14] text-water-200"
                  : "text-ink-300 hover:bg-white/[0.06] hover:text-ink-50",
              )}
            >
              <item.icon className="h-4 w-4" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function BackendStatus() {
  const [healthy, setHealthy] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    const check = () =>
      api
        .health()
        .then(() => active && setHealthy(true))
        .catch(() => active && setHealthy(false));
    void check();
    const timer = setInterval(check, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <span className="inline-flex shrink-0 items-center gap-2 text-2xs text-ink-300">
      <StatusDot
        tone={healthy === null ? "muted" : healthy ? "good" : "alert"}
        pulse={healthy === true}
        label="Backend API status"
      />
      <span className="hidden sm:inline">
        {healthy === null ? "Checking API" : healthy ? "API available" : "API unreachable"}
      </span>
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <div className="relative z-10 flex min-h-dvh flex-col bg-abyss-950">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-water-300 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-abyss-950"
        >
          Skip to content
        </a>

        <header className="shell-panel sticky top-0 z-40 flex shrink-0 items-center gap-3 border-b border-white/[0.08] px-3 py-2 sm:px-4">
          <Link
            href="/explore"
            className="shrink-0 rounded-md transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-300/60"
            aria-label="AquaNexus workspace"
          >
            <BrandLockup markClassName="h-7 w-7" subtitle={null} />
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <UtilityLinks />
            <span className="hidden h-4 w-px bg-white/10 sm:block" aria-hidden />
            <BackendStatus />
          </div>
        </header>

        <main id="main" className="flex min-h-0 flex-1 flex-col">
          {children}
        </main>
      </div>
    </AppProviders>
  );
}
