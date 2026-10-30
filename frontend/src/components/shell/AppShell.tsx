"use client";

/**
 * Application shell.
 *
 * A single, coherent navigation frame for the authenticated sections. The
 * primary workflow is SELECT LOCATION → COLLECT DATA → ANALYZE → VISUALIZE →
 * UNDERSTAND → FORECAST → GENERATE REPORT, and the navigation is organised
 * around it:
 *
 * - a persistent left rail with the full section list (desktop);
 * - a compact top bar with the brand, a live backend status and a mobile menu;
 * - every section is a real destination, not an empty page. The analysis
 *   sections deep-link into the Explore Map workspace with the relevant tab
 *   already open (`/explore?tab=…`), so they work without duplicating the
 *   workspace.
 *
 * The landing page at `/` does not use this shell — it is the public entry
 * point.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  Bookmark,
  CloudRain,
  Compass,
  Droplets,
  FileText,
  Globe2,
  LayoutDashboard,
  Leaf,
  Layers,
  Menu,
  Satellite,
  ShieldAlert,
  Sparkles,
  Waves,
  X,
} from "lucide-react";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BrandLockup } from "@/components/brand/Brand";
import { StatusDot } from "@/components/ui/primitives";
import { AppProviders } from "@/components/shell/AppProviders";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Activity;
  /** True when the link is active for any path under `href`. */
  prefix?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/home", label: "Overview", icon: LayoutDashboard, prefix: true },
      { href: "/explore", label: "Explore Map", icon: Compass, prefix: true },
      { href: "/study-areas", label: "Saved Investigations", icon: Bookmark, prefix: true },
      { href: "/reports", label: "Reports", icon: FileText, prefix: true },
    ],
  },
  {
    label: "Local intelligence",
    items: [
      { href: "/explore?tab=water-presence", label: "Local Intelligence", icon: Droplets },
      { href: "/explore?tab=water-atlas", label: "Water Atlas", icon: Layers },
      { href: "/explore?tab=water-stress", label: "Water Stress", icon: Waves },
      { href: "/explore?tab=flood", label: "Flood Intelligence", icon: ShieldAlert },
      { href: "/explore?tab=precipitation", label: "Rainfall Intelligence", icon: CloudRain },
      { href: "/explore?tab=satellite", label: "Satellite Intelligence", icon: Satellite },
      { href: "/explore?tab=weather", label: "Environmental Analysis", icon: Leaf },
    ],
  },
  {
    label: "Global & AI",
    items: [
      { href: "/global", label: "Global Intelligence", icon: Globe2, prefix: true },
      { href: "/explore?tab=ai", label: "AI Intelligence", icon: Sparkles },
    ],
  },
];

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
    <span className="inline-flex items-center gap-2 text-[0.6875rem] text-ink-300">
      <StatusDot
        tone={healthy === null ? "muted" : healthy ? "good" : "alert"}
        pulse={healthy === true}
        label="Backend API status"
      />
      {healthy === null ? "Checking API" : healthy ? "API available" : "API unreachable"}
    </span>
  );
}

function isActive(pathname: string, item: NavItem): boolean {
  const base = item.href.split("?")[0] ?? item.href;
  if (item.prefix) return pathname === base || pathname.startsWith(`${base}/`);
  return false;
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const Icon = item.icon;
  const active = isActive(pathname, item);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition",
        active
          ? "bg-water-400/15 text-water-100 shadow-[inset_0_0_0_1px_rgba(69,182,232,0.25)]"
          : "text-ink-300 hover:bg-white/[0.05] hover:text-ink-50",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavGroups({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Sections" className="flex flex-col gap-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="label-caps px-3 pb-1.5">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.href}>
                <NavLink item={item} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <AppProviders>
      <div className="relative z-10 flex min-h-dvh bg-abyss-950">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-water-400 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-abyss-950"
        >
          Skip to content
        </a>

        {/* Desktop rail */}
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-white/[0.06] bg-abyss-900/60 px-3 py-4 backdrop-blur lg:flex">
          <Link
            href="/home"
            className="mb-5 shrink-0 rounded-md px-1 transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-400/60"
            aria-label="AquaNexus overview"
          >
            <BrandLockup markClassName="h-8 w-8" subtitle={null} />
          </Link>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <NavGroups />
          </div>
          <div className="mt-4 shrink-0 border-t border-white/[0.06] pt-3">
            <BackendStatus />
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-4 border-b border-white/[0.06] bg-abyss-900/85 px-4 backdrop-blur lg:hidden">
            <Link
              href="/home"
              className="shrink-0 rounded-md transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-400/60"
              aria-label="AquaNexus overview"
            >
              <BrandLockup markClassName="h-8 w-8" subtitle={null} />
            </Link>

            <div className="ml-auto flex items-center gap-3">
              <span className="hidden sm:inline-flex">
                <BackendStatus />
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-controls="app-mobile-menu"
                aria-label={menuOpen ? "Close navigation" : "Open navigation"}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-ink-200 transition hover:text-ink-50"
              >
                {menuOpen ? (
                  <X className="h-5 w-5" aria-hidden />
                ) : (
                  <Menu className="h-5 w-5" aria-hidden />
                )}
              </button>
            </div>
          </header>

          {menuOpen ? (
            <div
              id="app-mobile-menu"
              className="max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b border-white/[0.06] bg-abyss-950/95 px-3 py-4 lg:hidden"
            >
              <NavGroups onNavigate={() => setMenuOpen(false)} />
            </div>
          ) : null}

          <main id="main" className="flex min-h-0 flex-1 flex-col">
            {children}
          </main>
        </div>
      </div>
    </AppProviders>
  );
}
