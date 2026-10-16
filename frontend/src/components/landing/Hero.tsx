
/**
 * AquaNexus landing hero.
 * A scientific, map-inspired introduction to the water intelligence platform.
 */
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  Compass,
  Globe2,
  Waves,
} from "lucide-react";

import { EarthGlobe } from "@/components/landing/EarthGlobe";

const PILLARS = [
  "Rainfall history & forecasts",
  "Modelled river discharge",
  "Satellite scene metadata",
  "Traceable provenance",
];

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Scientific atmosphere */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at 78% 32%, rgba(18,163,201,.15), transparent 38%), radial-gradient(ellipse at 12% 85%, rgba(22,176,146,.08), transparent 38%)",
        }}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:56px_56px]"
        style={{
          maskImage:
            "linear-gradient(to bottom, black, transparent 90%)",
        }}
      />

      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20 lg:grid-cols-[1.02fr_.98fr] lg:gap-4 lg:px-8 lg:pb-28 lg:pt-24">
        {/* Main message */}
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-cyan-200/15 bg-cyan-300/[0.055] px-3.5 py-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-40 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[.19em] text-cyan-100 sm:text-[11px]">
              Global water intelligence
            </span>
          </div>

          <h1 className="mt-7 max-w-[680px] text-balance font-display text-[2.8rem] font-medium leading-[1.04] tracking-[-.055em] text-white sm:text-6xl lg:text-[4.5rem] xl:text-[5rem]">
            Water shapes
            <br />
            <span className="text-gradient-water">
              everything.
            </span>
            <br />
            <span className="text-white/75">Understand its signals.</span>
          </h1>

          <p className="mt-7 max-w-lg text-[15px] leading-7 text-slate-300 sm:text-base sm:leading-8">
            Investigate changing water conditions through geospatial
            data, environmental indicators, and evidence you can trace
            back to its source.
          </p>

          {/* Primary actions — original destinations preserved */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/explore"
              className="group inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-cyan-300 px-5 py-3 text-sm font-semibold text-[#041522] shadow-[0_8px_30px_rgba(18,163,201,.16)] transition duration-200 hover:-translate-y-0.5 hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-200"
            >
              Create Study Area
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-1"
                aria-hidden="true"
              />
            </Link>

            <Link
              href="/atlas"
              className="group inline-flex min-h-12 items-center justify-center gap-2.5 rounded-lg border border-white/15 bg-white/[0.035] px-5 py-3 text-sm font-medium text-white transition duration-200 hover:border-cyan-200/40 hover:bg-cyan-200/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-200"
            >
              <Compass
                className="h-4 w-4 text-cyan-200"
                aria-hidden="true"
              />
              Explore the Atlas
              <ArrowDownRight
                className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:translate-y-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>

          {/* Capability index */}
          <div className="mt-10 max-w-xl border-t border-white/10 pt-5 sm:mt-12">
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-[.2em] text-slate-500">
              Explore the evidence
            </p>

            <ul className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
              {PILLARS.map((pillar) => (
                <li
                  key={pillar}
                  className="flex items-center gap-2.5 text-xs leading-5 text-slate-300"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-cyan-200/15 bg-cyan-200/[.05]">
                    <ArrowRight
                      className="h-3 w-3 text-cyan-200"
                      aria-hidden="true"
                    />
                  </span>
                  {pillar}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Earth visual and scientific framing */}
        <div className="relative mx-auto w-full max-w-[570px] lg:-mr-5">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[72%] w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/[.07] blur-3xl" />

          <div className="relative">
            <EarthGlobe className="mx-auto w-full max-w-[34rem]" />

            {/* Corner labels frame the globe as a data instrument */}
            <div className="pointer-events-none absolute left-[3%] top-[12%] hidden sm:block">
              <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[.18em] text-cyan-100/65">
                <span className="h-px w-5 bg-cyan-200/50" />
                Planetary systems
              </div>
            </div>

            <div className="pointer-events-none absolute bottom-[13%] right-[2%] hidden sm:block">
              <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[.18em] text-cyan-100/65">
                Hydrological signals
                <span className="h-px w-5 bg-cyan-200/50" />
              </div>
            </div>
          </div>

          {/* Small editorial caption */}
          <div className="mx-auto mt-2 flex max-w-sm items-center justify-center gap-2.5 border-t border-white/[.09] px-3 pt-4">
            <Globe2
              className="h-3.5 w-3.5 shrink-0 text-cyan-200/70"
              aria-hidden="true"
            />
            <p className="text-center text-[9px] font-medium uppercase leading-5 tracking-[.16em] text-slate-500">
              Earth observation · Environmental intelligence
            </p>
            <Waves
              className="h-3.5 w-3.5 shrink-0 text-cyan-200/70"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
