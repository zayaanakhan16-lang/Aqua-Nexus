"use client";

/**
 * Application shell.
 *
 * A single, coherent navigation frame for the authenticated sections: the brand
 * lockup, the primary sections (Intelligence Home, Explore Map, Study Areas,
 * Water Atlas) and a live backend status indicator. It wraps its children in the
 * shared providers so every section sees the same study-area store and toasts.
 *
 * The landing page at `/` does not use this shell — it is the public entry point.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Compass, Github, Home, Layers, Map, Menu, X } from "lucide-react";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BrandLockup } from "@/components/brand/Brand";
import { StatusDot } from "@/components/ui/primitives";
import { AppProviders } from "@/components/shell/AppProviders";

const NAV = [
  { href: "/home", label: "Intelligence Home", icon: Home },
  { href: "/explore", label: "Explore Map", icon: Compass },
  { href: "/study-areas", label: "Study Areas", icon: Layers },
  { href: "/atlas", label: "Water Atlas", icon: Map },
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
    <span className="inline-flex items-center gap-2 text-[0.6875rem] text-ink-400">
      <StatusDot
        tone={healthy === null ? "muted" : healthy ? "good" : "alert"}
        pulse={healthy === true}
        label="Backend API status"
      />
      {healthy === null ? "Checking API" : healthy ? "API available" : "API unreachable"}
    </span>
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
      <div className="relative z-10 flex min-h-dvh flex-col bg-abyss-950">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-water-400 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-abyss-950"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-4 border-b border-white/[0.06] bg-abyss-900/85 px-4 backdrop-blur">
          <Link
            href="/home"
            className="shrink-0 rounded-md transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-400/60"
            aria-label="AquaNexus home"
          >
            <BrandLockup markClassName="h-8 w-8" subtitle={null} />
          </Link>

          <nav aria-label="Primary" className="ml-2 hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition",
                    active
                      ? "bg-water-400/15 text-water-100"
                      : "text-ink-300 hover:bg-white/[0.05] hover:text-ink-50",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:inline-flex">
              <BackendStatus />
            </span>
            <a
              href="https://github.com/zayaanakhan16-lang/Aqua-Nexus"
              target="_blank"
              rel="noreferrer noopener"
              className="hidden rounded-md border border-white/[0.08] bg-white/[0.02] p-1.5 text-ink-400 transition hover:text-ink-100 sm:inline-flex"
              aria-label="View source repository"
            >
              <Github className="h-4 w-4" aria-hidden />
            </a>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="app-mobile-menu"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-ink-200 transition hover:text-ink-50 md:hidden"
            >
              {menuOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
            </button>
          </div>
        </header>

        {menuOpen ? (
          <nav
            id="app-mobile-menu"
            aria-label="Primary mobile"
            className="border-b border-white/[0.06] bg-abyss-950/95 px-4 py-2 md:hidden"
          >
            <ul className="grid gap-1">
              {NAV.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2.5 text-sm transition",
                        active ? "bg-water-400/15 text-water-100" : "text-ink-200 hover:bg-white/[0.05]",
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}

        <main id="main" className="flex min-h-0 flex-1 flex-col">
          {children}
        </main>
      </div>
    </AppProviders>
  );
}
