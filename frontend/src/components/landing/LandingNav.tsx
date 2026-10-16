
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";

import { BrandLockup } from "@/components/brand/Brand";

const LINKS = [
  { href: "#capabilities", label: "Capabilities" },
  { href: "#water-stress", label: "Water Stress" },
  { href: "#flood", label: "Flood Intelligence" },
  { href: "#weather", label: "Weather & Rainfall" },
  { href: "#satellite", label: "Satellite" },
  { href: "#sources", label: "Data Sources" },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onResize = () => {
      if (window.innerWidth >= 1024) setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#061426]/85 backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/25 to-transparent" />

      <div className="mx-auto flex h-[68px] max-w-[1440px] items-center gap-5 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link
          href="/"
          className="shrink-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
          aria-label="AquaNexus home"
        >
          <BrandLockup subtitle={null} />
        </Link>

        {/* Desktop navigation */}
        <nav
          aria-label="Primary"
          className="ml-3 hidden min-w-0 flex-1 items-center justify-center xl:flex"
        >
          <div className="flex items-center gap-0.5 rounded-xl border border-white/[0.055] bg-white/[0.018] p-1">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="whitespace-nowrap rounded-lg px-3 py-2 text-[12px] font-medium text-slate-400 transition-colors duration-200 hover:bg-white/[0.055] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
              >
                {link.label}
              </a>
            ))}
          </div>
        </nav>

        {/* Actions */}
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <Link
            href="/atlas"
            className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.05] hover:text-white sm:inline-flex"
          >
            Open Atlas
            <ChevronDown
              className="h-3.5 w-3.5 -rotate-90 text-slate-500"
              aria-hidden="true"
            />
          </Link>

          <Link
            href="/explore"
            className="group inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-3.5 py-2 text-xs font-semibold text-[#041522] shadow-[0_4px_20px_rgba(18,163,201,.12)] transition hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 sm:px-4 sm:text-sm"
          >
            <span className="hidden sm:inline">Create Study Area</span>
            <span className="sm:hidden">Get started</span>
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            aria-label={open ? "Close navigation menu" : "Open navigation menu"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.025] text-slate-300 transition hover:border-cyan-200/25 hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200 xl:hidden"
          >
            {open ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile and tablet navigation */}
      {open && (
        <nav
          id="landing-mobile-menu"
          aria-label="Primary mobile"
          className="border-t border-white/[0.07] bg-[#061426]/[0.98] px-4 py-4 shadow-2xl sm:px-6 xl:hidden"
        >
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-slate-500">
            Navigate AquaNexus
          </p>

          <ul className="grid gap-1 sm:grid-cols-2">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center justify-between rounded-lg px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/[0.05] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
                >
                  {link.label}
                  <ArrowRight
                    className="h-3.5 w-3.5 text-slate-600"
                    aria-hidden="true"
                  />
                </a>
              </li>
            ))}
          </ul>

          <div className="mt-3 grid gap-2 border-t border-white/[0.07] pt-3 sm:grid-cols-2">
            <Link
              href="/atlas"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center justify-center rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/[0.05]"
            >
              Open Atlas
            </Link>

            <Link
              href="/explore"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-[#041522] transition hover:bg-cyan-200"
            >
              Create Study Area
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
