/**
 * Product preview.
 *
 * A structural schematic of the real /atlas workspace built from the same UI
 * vocabulary the app uses (panel headers, classification badges, layer rows,
 * map graticule). It deliberately shows placeholder dashes instead of numbers:
 * this is a layout preview, not a fabricated dataset or live dashboard.
 */
import Link from "next/link";
import {
  ArrowRight,
  CloudRain,
  Droplets,
  Layers,
  MapPin,
  Satellite,
  Search,
} from "lucide-react";

import { ClassificationBadge, Chip, StatusDot } from "@/components/ui/primitives";

const LAYER_ROWS = [
  { icon: CloudRain, label: "Precipitation", on: true },
  { icon: Droplets, label: "River discharge", on: true },
  { icon: Satellite, label: "Satellite scenes", on: false },
  { icon: MapPin, label: "Place markers", on: true },
];

export function ProductPreview() {
  return (
    <section id="preview" className="border-t border-white/[0.06] py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="label-caps text-water-300">Product preview</p>
          <h2 className="mt-3 text-balance font-display text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
            The Water Atlas workspace
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-300">
            A three-part workspace: search and layer controls on the left, the interactive
            globe in the centre, and evidence-backed intelligence on the right. Values are
            shown with their unit, classification and limitations.
          </p>
        </div>

        <figure className="mt-10">
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-abyss-900 shadow-panel">
            {/* Window chrome. */}
            <div className="flex items-center gap-2 border-b border-white/[0.06] bg-abyss-850/80 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-signal-alert/60" aria-hidden />
              <span className="h-2.5 w-2.5 rounded-full bg-signal-caution/60" aria-hidden />
              <span className="h-2.5 w-2.5 rounded-full bg-signal-good/60" aria-hidden />
              <span className="ml-3 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 font-mono text-[0.625rem] text-ink-400">
                aquanexus / atlas
              </span>
            </div>

            <div className="grid gap-px bg-white/[0.04] lg:grid-cols-[15rem_minmax(0,1fr)_16rem]">
              {/* Left rail */}
              <div className="space-y-3 bg-abyss-900 p-3" aria-hidden>
                <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-2 text-xs text-ink-500">
                  <Search className="h-3.5 w-3.5" />
                  Search a place or coordinates
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-abyss-900/60 p-3">
                  <div className="mb-2 flex items-center gap-2 text-ink-300">
                    <Layers className="h-3.5 w-3.5 text-water-300" />
                    <span className="text-[0.625rem] font-semibold uppercase tracking-[0.14em]">
                      Map layers
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {LAYER_ROWS.map((row) => {
                      const Icon = row.icon;
                      return (
                        <li key={row.label} className="flex items-center gap-2.5">
                          <span
                            className={`flex h-4 w-7 items-center rounded-full px-0.5 ${
                              row.on ? "bg-water-400/80" : "bg-white/10"
                            }`}
                          >
                            <span
                              className={`h-3 w-3 rounded-full bg-abyss-950 transition ${
                                row.on ? "translate-x-3" : "translate-x-0"
                              }`}
                            />
                          </span>
                          <Icon className="h-3.5 w-3.5 text-ink-400" />
                          <span className="text-xs text-ink-300">{row.label}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              {/* Map */}
              <div className="relative min-h-[16rem] bg-abyss-950" aria-hidden>
                <svg viewBox="0 0 400 260" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
                  <defs>
                    <radialGradient id="pp-map" cx="52%" cy="40%" r="72%">
                      <stop offset="0%" stopColor="#123a58" />
                      <stop offset="100%" stopColor="#061426" />
                    </radialGradient>
                  </defs>
                  <rect width="400" height="260" fill="url(#pp-map)" />
                  <g stroke="#9deafa" strokeOpacity="0.12" strokeWidth="0.6">
                    {[40, 80, 120, 160, 200, 240, 280, 320, 360].map((x) => (
                      <line key={`x${x}`} x1={x} y1="0" x2={x} y2="260" />
                    ))}
                    {[40, 80, 120, 160, 200, 240].map((y) => (
                      <line key={`y${y}`} x1="0" y1={y} x2="400" y2={y} />
                    ))}
                  </g>
                  <path
                    d="M120 96c30-24 78-16 96 12s6 62-22 76-52 34-70 8-18-72-4-96Z"
                    fill="#2f9c86"
                    fillOpacity="0.35"
                  />
                  <g>
                    <circle cx="196" cy="150" r="16" fill="none" stroke="#63d8f3" strokeOpacity="0.6" />
                    <circle cx="196" cy="150" r="4.5" fill="#eafcff" stroke="#12a3c9" strokeWidth="1.5" />
                  </g>
                </svg>
                {/* Legend chip + controls, echoing the real map chrome. */}
                <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                  <Chip>Reset to global view</Chip>
                  <Chip>Clear selection</Chip>
                </div>
                <div className="absolute bottom-3 left-3 rounded-lg border border-white/10 bg-abyss-900/85 px-3 py-2">
                  <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-ink-300">
                    Legend · Precipitation
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[0.6875rem] text-ink-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-water-400" /> mm · daily mean rate
                  </p>
                </div>
              </div>

              {/* Right rail */}
              <div className="space-y-2 bg-abyss-900 p-3" aria-hidden>
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                  <span className="text-xs font-semibold text-ink-100">Location intelligence</span>
                  <StatusDot tone="muted" />
                </div>
                {[
                  { label: "Rainfall anomaly", cls: "reanalysis" as const },
                  { label: "Forecast 7-day total", cls: "forecast" as const },
                  { label: "River discharge ratio", cls: "simulation" as const },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-ink-200">{row.label}</span>
                      <span className="font-mono text-xs text-ink-400">—</span>
                    </div>
                    <div className="mt-1.5">
                      <ClassificationBadge classification={row.cls} compact />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <figcaption className="mt-3 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <p className="max-w-2xl text-xs leading-relaxed text-ink-500">
              Layout schematic of <span className="font-mono text-ink-400">/atlas</span>. Values
              are shown as “—” placeholders — this preview contains no readings and no live
              indicators.
            </p>
            <Link
              href="/atlas"
              className="group inline-flex shrink-0 items-center gap-2 rounded-lg border border-water-400/30 bg-water-400/[0.08] px-4 py-2 text-sm font-semibold text-water-100 transition hover:bg-water-400/[0.16]"
            >
              Open the Water Atlas
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
