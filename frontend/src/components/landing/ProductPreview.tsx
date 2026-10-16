
/**
 * AquaNexus product preview.
 *
 * A polished, explicitly illustrative view of the Atlas workspace.
 * All readings remain placeholders; no fabricated live data is shown.
 */
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CloudRain,
  Droplets,
  Layers,
  MapPin,
  Satellite,
  Search,
  ShieldCheck,
} from "lucide-react";

import {
  ClassificationBadge,
  Chip,
  StatusDot,
} from "@/components/ui/primitives";

const LAYER_ROWS = [
  { icon: CloudRain, label: "Precipitation", on: true },
  { icon: Droplets, label: "River discharge", on: true },
  { icon: Satellite, label: "Satellite scenes", on: false },
  { icon: MapPin, label: "Place markers", on: true },
];

const INDICATORS = [
  { label: "Rainfall anomaly", cls: "reanalysis" as const },
  { label: "Forecast 7-day total", cls: "forecast" as const },
  { label: "River discharge ratio", cls: "simulation" as const },
];

export function ProductPreview() {
  return (
    <section
      id="preview"
      className="relative overflow-hidden border-t border-white/[0.07] py-20 sm:py-28"
    >
      {/* Restrained ambient lighting */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-12rem] top-20 -z-10 h-96 w-96 rounded-full bg-cyan-400/[0.055] blur-3xl"
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section introduction */}
        <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/15 bg-cyan-300/[0.045] px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
              <span className="text-[10px] font-semibold uppercase tracking-[.19em] text-cyan-100">
                Inside AquaNexus
              </span>
            </div>

            <h2 className="mt-5 text-balance font-display text-3xl font-medium tracking-tight text-white sm:text-4xl lg:text-5xl">
              From a place on the map
              <span className="block text-gradient-water">
                to evidence you can explore.
              </span>
            </h2>

            <p className="mt-5 max-w-xl text-sm leading-7 text-slate-400 sm:text-base sm:leading-8">
              Explore environmental layers, inspect locations, and
              understand the context behind water-related indicators
              in one geospatial workspace.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3.5 py-3">
              <p className="text-[9px] font-semibold uppercase tracking-[.16em] text-slate-500">
                Workspace
              </p>
              <p className="mt-1 text-sm font-medium text-slate-200">
                Interactive Atlas
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3.5 py-3">
              <p className="text-[9px] font-semibold uppercase tracking-[.16em] text-slate-500">
                Data approach
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-slate-200">
                <ShieldCheck className="h-3.5 w-3.5 text-cyan-200" />
                Traceable evidence
              </p>
            </div>
          </div>
        </div>

        {/* Workspace window */}
        <figure className="mt-10 sm:mt-14">
          <div className="overflow-hidden rounded-xl border border-white/[0.11] bg-[#071426] shadow-[0_35px_100px_-35px_rgba(0,0,0,.9)] sm:rounded-2xl">
            {/* Application chrome */}
            <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-white/[0.018] px-4 py-3 sm:px-5">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5" aria-hidden="true">
                  <span className="h-2 w-2 rounded-full bg-rose-300/60" />
                  <span className="h-2 w-2 rounded-full bg-amber-200/60" />
                  <span className="h-2 w-2 rounded-full bg-emerald-300/60" />
                </div>
                <span className="h-4 w-px bg-white/10" />
                <span className="font-mono text-[10px] text-slate-400">
                  AQUANEXUS <span className="text-slate-600">/</span> ATLAS
                </span>
              </div>

              <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.025] px-2.5 py-1 text-[9px] font-medium uppercase tracking-[.12em] text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                Illustrative preview
              </span>
            </div>

            {/* Three-panel workspace */}
            <div className="grid gap-px bg-white/[0.075] lg:grid-cols-[220px_minmax(0,1fr)_250px]">
              {/* Layer sidebar */}
              <aside
                aria-label="Illustrative map layer controls"
                className="space-y-4 bg-[#081629] p-4 sm:p-5"
              >
                <div>
                  <p className="mb-3 text-[9px] font-semibold uppercase tracking-[.18em] text-slate-500">
                    Location
                  </p>
                  <div className="flex min-h-10 items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.025] px-3">
                    <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                    <span className="text-[11px] text-slate-500">
                      Search a place...
                    </span>
                  </div>
                </div>

                <div className="h-px bg-white/[0.07]" />

                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="h-3.5 w-3.5 text-cyan-200" />
                      <span className="text-[10px] font-semibold uppercase tracking-[.15em] text-slate-300">
                        Map layers
                      </span>
                    </div>
                    <span className="font-mono text-[9px] text-slate-600">
                      04
                    </span>
                  </div>

                  <ul className="space-y-1">
                    {LAYER_ROWS.map((row) => {
                      const Icon = row.icon;

                      return (
                        <li key={row.label}>
                          <div className="flex min-h-9 items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-white/[0.035]">
                            <span
                              className={`flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 ${
                                row.on
                                  ? "justify-end bg-cyan-300/80"
                                  : "justify-start bg-white/10"
                              }`}
                            >
                              <span className="h-3 w-3 rounded-full bg-[#071426] shadow-sm" />
                            </span>
                            <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="min-w-0 flex-1 text-[11px] text-slate-300">
                              {row.label}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="rounded-lg border border-cyan-200/[0.12] bg-cyan-200/[0.035] p-3">
                  <div className="flex items-center gap-2 text-cyan-100/80">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-medium">
                      Evidence matters
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] leading-5 text-slate-500">
                    Interpret indicators with their source and limitations.
                  </p>
                </div>
              </aside>

              {/* Map canvas */}
              <div className="relative min-h-[280px] overflow-hidden bg-[#061426] sm:min-h-[360px] lg:min-h-[430px]">
                <svg
                  viewBox="0 0 600 460"
                  className="absolute inset-0 h-full w-full"
                  preserveAspectRatio="xMidYMid slice"
                  role="img"
                  aria-label="Stylized illustrative map grid with a location marker"
                >
                  <defs>
                    <radialGradient id="pp-map-glow" cx="48%" cy="42%" r="75%">
                      <stop offset="0%" stopColor="#123a58" />
                      <stop offset="100%" stopColor="#061426" />
                    </radialGradient>
                    <linearGradient id="pp-river" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#2e9dbd" stopOpacity=".08" />
                      <stop offset="55%" stopColor="#50cce8" stopOpacity=".8" />
                      <stop offset="100%" stopColor="#2e9dbd" stopOpacity=".08" />
                    </linearGradient>
                  </defs>

                  <rect width="600" height="460" fill="url(#pp-map-glow)" />

                  <g
                    stroke="#8ce8f7"
                    strokeOpacity=".105"
                    strokeWidth=".7"
                  >
                    {Array.from({ length: 15 }, (_, i) => (
                      <line
                        key={`vx-${i}`}
                        x1={i * 44}
                        y1="0"
                        x2={i * 44}
                        y2="460"
                      />
                    ))}
                    {Array.from({ length: 12 }, (_, i) => (
                      <line
                        key={`hy-${i}`}
                        x1="0"
                        y1={i * 42}
                        x2="600"
                        y2={i * 42}
                      />
                    ))}
                  </g>

                  {/* Abstract terrain forms, not a real geographic boundary */}
                  <g stroke="#71c7b3" strokeWidth="1" strokeOpacity=".22">
                    <path
                      d="M70 115 C125 70 165 105 205 145 S290 205 330 160 S420 95 480 145 S540 200 590 160"
                      fill="none"
                    />
                    <path
                      d="M35 150 C100 105 155 140 190 175 S275 235 325 190 S420 125 470 175 S540 235 600 195"
                      fill="none"
                    />
                    <path
                      d="M0 195 C90 155 140 185 180 215 S265 265 320 230 S420 170 475 215 S545 275 600 235"
                      fill="none"
                    />
                    <path
                      d="M110 0 C155 70 125 120 160 170 S210 280 180 340 S200 420 245 460"
                      fill="none"
                    />
                    <path
                      d="M145 0 C190 70 160 120 195 170 S245 280 215 340 S235 420 280 460"
                      fill="none"
                    />
                  </g>

                  <path
                    d="M0 345 C100 320 140 265 220 285 S335 360 400 310 S520 260 600 285"
                    fill="none"
                    stroke="url(#pp-river)"
                    strokeWidth="2"
                  />

                  <g transform="translate(315 225)">
                    <circle r="43" fill="#27b9d8" fillOpacity=".045" />
                    <circle r="29" fill="none" stroke="#63d8f3" strokeOpacity=".18" />
                    <circle r="18" fill="none" stroke="#63d8f3" strokeOpacity=".42" />
                    <circle r="7" fill="#eafcff" stroke="#12a3c9" strokeWidth="2" />
                  </g>
                </svg>

                {/* Canvas labels */}
                <div className="absolute left-3 top-3 flex flex-wrap gap-2 sm:left-5 sm:top-5">
                  <Chip>Global view</Chip>
                  <Chip>Illustrative map</Chip>
                </div>

                <div className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#071426]/85 text-slate-400 sm:right-5 sm:top-5">
                  <Layers className="h-3.5 w-3.5" />
                </div>

                <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3 sm:bottom-5 sm:left-5 sm:right-5">
                  <div className="max-w-[220px] rounded-lg border border-white/[0.09] bg-[#071426]/90 p-3 backdrop-blur-md">
                    <p className="text-[9px] font-semibold uppercase tracking-[.16em] text-slate-400">
                      Layer legend
                    </p>
                    <p className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-300">
                      <span className="h-2 w-2 rounded-full bg-cyan-300" />
                      Precipitation
                    </p>
                    <p className="mt-1 text-[9px] leading-4 text-slate-500">
                      Units and interpretation depend on the selected dataset.
                    </p>
                  </div>

                  <div className="hidden items-center gap-2 text-[9px] uppercase tracking-[.14em] text-slate-500 sm:flex">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-300/70" />
                    Map illustration
                  </div>
                </div>
              </div>

              {/* Intelligence sidebar */}
              <aside
                aria-label="Illustrative location intelligence panel"
                className="space-y-4 bg-[#081629] p-4 sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-300">
                      Location intelligence
                    </p>
                    <p className="mt-1.5 text-[10px] text-slate-500">
                      Example indicator categories
                    </p>
                  </div>
                  <StatusDot tone="muted" />
                </div>

                <div className="h-px bg-white/[0.07]" />

                <div className="space-y-2.5">
                  {INDICATORS.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-lg border border-white/[0.075] bg-white/[0.018] p-3 transition-colors hover:border-white/[0.13] hover:bg-white/[0.03]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[11px] leading-5 text-slate-300">
                          {item.label}
                        </span>
                        <span className="font-mono text-sm text-slate-500">
                          —
                        </span>
                      </div>
                      <div className="mt-2.5">
                        <ClassificationBadge
                          classification={item.cls}
                          compact
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-white/[0.07] p-3">
                  <div className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-cyan-200/70" />
                    <span className="text-[10px] font-medium text-slate-300">
                      Context before conclusions
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] leading-5 text-slate-500">
                    An indicator is not a complete assessment on its own.
                  </p>
                </div>
              </aside>
            </div>

            {/* Workspace footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] bg-white/[0.018] px-4 py-3 sm:px-5">
              <p className="text-[9px] leading-4 text-slate-500">
                Schematic interface · No live measurements displayed
              </p>
              <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[.12em] text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-cyan-200/70" />
                Evidence-aware design
              </div>
            </div>
          </div>

          <figcaption className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <p className="max-w-xl text-xs leading-6 text-slate-500">
              An illustrative preview of the Atlas interface. The map,
              controls, and placeholder values above are a visual
              schematic, not a live workspace or real environmental data.
            </p>

            <Link
              href="/home"
              className="group inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-cyan-200/20 bg-cyan-200/[0.055] px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200/35 hover:bg-cyan-200/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
            >
              Open the Water Atlas
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-1"
                aria-hidden="true"
              />
            </Link>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
