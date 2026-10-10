"use client";

import Link from "next/link";
import { Droplets, Github, Home } from "lucide-react";

import { BrandLockup } from "@/components/brand/Brand";
import { StatusDot } from "@/components/ui/primitives";

export function TopBar({ apiHealthy }: { apiHealthy: boolean | null }) {
  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-4 border-b border-white/[0.06] bg-abyss-900/80 px-4 backdrop-blur">
      <Link
        href="/"
        className="shrink-0 rounded-md transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-400/60"
        aria-label="AquaNexus home"
      >
        <BrandLockup markClassName="h-8 w-8" />
      </Link>

      <nav aria-label="Primary" className="ml-2 hidden items-center gap-1 md:flex">
        <span className="rounded-md bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-ink-100">
          Water Atlas
        </span>
        <span
          className="cursor-not-allowed rounded-md px-3 py-1.5 text-xs font-medium text-ink-500"
          title="Planned module"
        >
          Baseline Explorer
          <span className="ml-1.5 rounded bg-white/[0.06] px-1 py-px text-[0.5625rem] uppercase tracking-wide">
            soon
          </span>
        </span>
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-[0.6875rem] text-ink-300 sm:flex">
          <StatusDot
            tone={apiHealthy === null ? "muted" : apiHealthy ? "good" : "alert"}
            pulse={apiHealthy === true}
            label="Backend API status"
          />
          {apiHealthy === null
            ? "Checking API"
            : apiHealthy
              ? "API available"
              : "API unreachable"}
        </span>
        <Link
          href="/"
          className="rounded-md border border-white/[0.08] bg-white/[0.02] p-1.5 text-ink-400 transition hover:text-ink-100"
          aria-label="Back to landing page"
        >
          <Home className="h-4 w-4" aria-hidden />
        </Link>
        <a
          href="https://github.com/zayaanakhan16-lang/Aqua-Nexus"
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-md border border-white/[0.08] bg-white/[0.02] p-1.5 text-ink-400 transition hover:text-ink-100"
          aria-label="View source repository"
        >
          <Github className="h-4 w-4" aria-hidden />
        </a>
        <span className="hidden items-center gap-1.5 text-[0.6875rem] text-ink-500 lg:flex">
          <Droplets className="h-3.5 w-3.5 text-water-400" aria-hidden />
          Understand Water · Detect Risks · Find Solutions
        </span>
      </div>
    </header>
  );
}
