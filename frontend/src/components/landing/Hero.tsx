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
  "Surface-water observations",
  "Rainfall history & forecasts",
  "Satellite imagery & change",
  "Traceable provenance",
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* A flat hairline graticule, matching the workspace. No glow. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 grid-lines opacity-60" />
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:px-8 lg:pb-20 lg:pt-16">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-2xs font-semibold uppercase tracking-[0.16em] text-water-200">
            <Globe2 className="h-3.5 w-3.5" aria-hidden />
            Global water intelligence
          </p>

          <h1 className="mt-5 text-balance font-display text-3xl font-semibold leading-[1.1] tracking-[-0.02em] text-ink-50 sm:text-4xl lg:text-5xl">
            See the water risks
            <br />
            shaping our world.
          </h1>

          <p className="mt-4 font-display text-base font-medium tracking-[-0.01em] text-water-200 sm:text-lg">
            Understand Water. Detect Risks. Find Solutions.
          </p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-300 sm:text-base">
            Select any point or draw an area anywhere on Earth. AquaNexus investigates it with real
            satellite, rainfall, weather and water-body evidence, then explains what the data shows
            and what it does not.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/explore"
              className="group inline-flex items-center gap-2 rounded-lg bg-ink-100 px-4 py-2.5 text-xs font-semibold text-abyss-950 transition hover:bg-white"
            >
              Create Study Area
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link
              href="/study-areas"
              className="inline-flex items-center gap-2 rounded-lg border border-white/12 bg-white/[0.02] px-4 py-2.5 text-xs font-semibold text-ink-100 transition hover:border-water-300/40 hover:bg-water-300/[0.08]"
            >
              <Compass className="h-4 w-4 text-water-300" aria-hidden />
              Saved study areas
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2">
            {PILLARS.map((pillar) => (
              <li key={pillar} className="flex items-center gap-2 text-xs text-ink-400">
                <span className="h-1 w-1 rounded-full bg-water-300" aria-hidden />
                {pillar}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-xl">
          <EarthGlobe className="mx-auto w-full max-w-[34rem] animate-float-slow motion-reduce:animate-none" />
          <p className="mt-3 text-center text-3xs uppercase tracking-[0.18em] text-ink-500">
            Earth imagery — NASA Blue Marble
          </p>
        </div>
      </div>
    </section>
  );
}
