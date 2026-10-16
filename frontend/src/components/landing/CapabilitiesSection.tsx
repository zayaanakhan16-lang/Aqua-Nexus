
/**
 * Platform capabilities.
 *
 * Each card maps to a real workspace module. Availability is stated honestly.
 */
import {
  ArrowUpRight,
  Check,
  CloudRain,
  Droplets,
  Satellite,
  Waves,
} from "lucide-react";

import { Reveal } from "@/components/landing/Reveal";

const MODULES = [
  {
    id: "water-stress",
    number: "01",
    icon: Waves,
    name: "Water Stress Explorer",
    category: "WATER AVAILABILITY",
    status: "Available",
    body: "Explore historical precipitation and available water-related indicators to identify regions that may need further investigation.",
    points: [
      "Rainfall history with a year-over-year comparison window",
      "Rainfall anomaly against a defensible baseline, or an explicit unavailable state",
      "Coverage, freshness and classification on every value",
    ],
  },
  {
    id: "flood",
    number: "02",
    icon: Droplets,
    name: "Flood Intelligence",
    category: "RIVER & FLOOD SIGNALS",
    status: "Available",
    body: "Examine forecast rainfall and modelled river discharge, with clear notes on what is modelled versus observed.",
    points: [
      "7-day forecast rainfall totals",
      "Modelled GloFAS river discharge and a discharge ratio",
      "No flood-risk verdict unless the method and inputs justify it",
    ],
  },
  {
    id: "weather",
    number: "03",
    icon: CloudRain,
    name: "Weather & Rainfall",
    category: "PRECIPITATION DATA",
    status: "Available",
    body: "Inspect forecast rainfall and historical context, with units, dates and provenance shown alongside each series.",
    points: [
      "Daily and multi-day precipitation forecasts",
      "Historical (reanalysis) rainfall for the selected window",
      "Forecasts kept structurally separate from observations",
    ],
  },
  {
    id: "satellite",
    number: "04",
    icon: Satellite,
    name: "Satellite Explorer",
    category: "EARTH OBSERVATION",
    status: "Available",
    body: "Discover available satellite scene metadata — footprints, acquisition dates and coverage — from a real catalogue.",
    points: [
      "Sentinel scene search via the Copernicus Data Space STAC API",
      "Scene footprints rendered on the map as metadata only",
      "Catalogue metadata, not processed imagery or water detection",
    ],
  },
];

export function CapabilitiesSection() {
  return (
    <section
      id="capabilities"
      className="grid-lines relative overflow-hidden border-t border-white/[0.06] py-20 sm:py-28"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-water-400/[0.045] blur-3xl"
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-3xl">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-water-300" />
            <p className="label-caps text-water-300">Platform capabilities</p>
          </div>

          <h2 className="mt-5 text-balance font-display text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl lg:text-5xl">
            Four modules.
            <span className="block text-ink-400">
              One evidence-first workspace.
            </span>
          </h2>

          <p className="mt-5 max-w-2xl text-base leading-7 text-ink-300 sm:text-lg">
            From rainfall patterns to satellite catalogue coverage, explore
            water-related signals with the context needed to interpret them.
            Forecasts, observations, model outputs and derived indicators remain
            clearly distinguished.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:mt-16 lg:gap-5">
          {MODULES.map((module, i) => {
            const Icon = module.icon;

            return (
              <Reveal key={module.id} delayMs={i * 75}>
                <article
                  id={module.id}
                  className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0a1724]/80 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-water-300/30 hover:bg-[#0c1d2c] sm:p-6"
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-water-300/[0.035] blur-3xl transition-colors duration-300 group-hover:bg-water-300/[0.09]"
                  />

                  <div className="relative flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-water-300/20 bg-water-300/[0.07] text-water-300 transition-colors duration-300 group-hover:border-water-300/40 group-hover:bg-water-300/[0.12]">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>

                      <div>
                        <p className="text-[10px] font-medium tracking-[0.16em] text-ink-400">
                          MODULE {module.number}
                        </p>
                        <p className="mt-1 text-[10px] font-medium tracking-[0.12em] text-water-300/80">
                          {module.category}
                        </p>
                      </div>
                    </div>

                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-signal-good/20 bg-signal-good/[0.06] px-2.5 py-1.5 text-[10px] font-medium text-signal-good">
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-signal-good"
                        aria-hidden="true"
                      />
                      {module.status}
                    </span>
                  </div>

                  <div className="relative mt-6 flex items-start justify-between gap-3">
                    <h3 className="font-display text-xl font-semibold tracking-tight text-ink-50 sm:text-2xl">
                      {module.name}
                    </h3>
                    <ArrowUpRight
                      className="mt-1 h-5 w-5 shrink-0 text-ink-500 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-water-300"
                      aria-hidden="true"
                    />
                  </div>

                  <p className="relative mt-3 text-sm leading-6 text-ink-300">
                    {module.body}
                  </p>

                  <div className="relative mt-6 border-t border-white/[0.08] pt-5">
                    <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                      What you can explore
                    </p>

                    <ul className="space-y-3">
                      {module.points.map((point) => (
                        <li
                          key={point}
                          className="flex items-start gap-2.5 text-xs leading-5 text-ink-300 sm:text-sm"
                        >
                          <Check
                            className="mt-0.5 h-4 w-4 shrink-0 text-water-300"
                            aria-hidden="true"
                          />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="relative mt-auto flex items-center gap-2 border-t border-white/[0.06] pt-4 mt-6">
                    <span className="h-1 w-1 rounded-full bg-water-300/80" />
                    <span className="text-[10px] tracking-wide text-ink-400">
                      Evidence-led · Data-aware · Traceable
                    </span>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>

        <Reveal delayMs={180}>
          <div className="mt-8 flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-ink-200">
                One principle across every module
              </p>
              <p className="mt-1 text-xs leading-5 text-ink-400">
                Every value needs context. Every limitation should be visible.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 text-xs font-medium text-water-300">
              <span className="h-2 w-2 rounded-full border border-water-300/70" />
              Built around traceable evidence
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
