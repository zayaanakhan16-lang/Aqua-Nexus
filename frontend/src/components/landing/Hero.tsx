/**
 * Landing hero.
 *
 * A cinematic composition built around a real photographic Earth (NASA Blue
 * Marble) rendered as a slowly rotating globe, plus the product's core message
 * and the two primary entry points into the application.
 */
import Link from "next/link";
import { ArrowRight, Compass, Globe2 } from "lucide-react";

import { EarthGlobe } from "@/components/landing/EarthGlobe";

const PILLARS = [
  "Rainfall history & forecasts",
  "Modelled river discharge",
  "Satellite scene metadata",
  "Traceable provenance",
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Ambient depth: two restrained radial washes, not neon. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(1100px_560px_at_76%_-8%,rgba(18,163,201,0.16),transparent_62%),radial-gradient(760px_480px_at_6%_104%,rgba(22,176,146,0.10),transparent_58%)]"
      />
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:px-8 lg:pb-28 lg:pt-24">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-water-200">
            <Globe2 className="h-3.5 w-3.5" aria-hidden />
            Global water intelligence
          </p>

          <h1 className="mt-6 text-balance font-display text-4xl font-semibold leading-[1.06] tracking-tight text-ink-50 sm:text-5xl lg:text-6xl">
            See the water risks
            <br />
            shaping our world.
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-300 sm:text-lg">
            Explore environmental conditions, understand changing water patterns, and turn
            location-specific evidence into informed decisions.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/explore"
              className="group inline-flex items-center gap-2 rounded-lg bg-water-400 px-5 py-3 text-sm font-semibold text-abyss-950 shadow-float transition hover:bg-water-300"
            >
              Create Study Area
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link
              href="/atlas"
              className="inline-flex items-center gap-2 rounded-lg border border-white/12 bg-white/[0.02] px-5 py-3 text-sm font-semibold text-ink-100 transition hover:border-water-400/40 hover:bg-water-400/[0.08]"
            >
              <Compass className="h-4 w-4 text-water-300" aria-hidden />
              Explore the Atlas
            </Link>
          </div>

          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2">
            {PILLARS.map((pillar) => (
              <li key={pillar} className="flex items-center gap-2 text-xs text-ink-400">
                <span className="h-1 w-1 rounded-full bg-water-400" aria-hidden />
                {pillar}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-xl">
          <EarthGlobe className="mx-auto w-full max-w-[34rem] animate-float-slow motion-reduce:animate-none" />
          <p className="mt-3 text-center text-[0.625rem] uppercase tracking-[0.18em] text-ink-500">
            Earth imagery — NASA Blue Marble
          </p>
        </div>
      </div>
    </section>
  );
}
