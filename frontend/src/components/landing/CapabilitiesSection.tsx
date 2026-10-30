/**
 * Platform capabilities.
 *
 * Each card maps to a real workspace module. Availability is stated honestly:
 * capabilities that are implemented are labelled "Available"; those that depend
 * on credentials or a future method are labelled accordingly.
 */
import {
  CloudRain,
  Droplets,
  Globe2,
  Satellite,
  ShieldAlert,
  Sparkles,
  Waves,
} from "lucide-react";

import { Reveal } from "@/components/landing/Reveal";

const MODULES = [
  {
    id: "water-stress",
    icon: Waves,
    name: "Water Stress Explorer",
    status: "Available",
    body: "Explore historical precipitation and available water-related indicators to identify regions that may need further investigation.",
    points: [
      "Rainfall history with a year-over-year comparison window",
      "Rainfall anomaly against a defensible baseline, or an explicit unavailable state",
      "Coverage, freshness and classification on every value",
    ],
  },
  {
    id: "water-presence",
    icon: Droplets,
    name: "Local Water Intelligence",
    status: "Available",
    body: "Investigate whether surface water is observable at the selected point, combining mapped water features with satellite imagery availability.",
    points: [
      "Observed and mapped surface-water presence, kept separate from flooding",
      "Nearby lakes, rivers and reservoirs with real outline geometry",
      "Insufficient evidence stated plainly — never rendered as 'no water'",
    ],
  },
  {
    id: "flood",
    icon: ShieldAlert,
    name: "Flood Intelligence",
    status: "Available",
    body: "Screen flood-related evidence — observed water extent, rainfall accumulation and modelled discharge — without issuing a fabricated probability.",
    points: [
      "Observed heavy-rainfall and rainfall-total signals",
      "Modelled GloFAS river discharge and a discharge ratio",
      "Labelled evidence-based screening, not an official flood warning",
    ],
  },
  {
    id: "weather",
    icon: CloudRain,
    name: "Weather & Rainfall",
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
    icon: Satellite,
    name: "Satellite Intelligence",
    status: "Available",
    body: "Discover available satellite scene metadata — footprints, acquisition dates and coverage — from real catalogues.",
    points: [
      "Sentinel-2 via the Copernicus Data Space STAC API and NASA HLS via CMR",
      "Scene footprints rendered on the map as metadata only",
      "Before/after scene pairing for change inspection",
    ],
  },
  {
    id: "outlook",
    icon: CloudRain,
    name: "Future Outlook",
    status: "Available",
    body: "Read the modelled forecast for the selected area: upcoming rainfall, rainy and dry periods, and derived rainfall-concern signals.",
    points: [
      "14-day forecast accumulation and heavy-rainfall indicators",
      "Rainy and dry forecast periods with totals",
      "Every value labelled as a forecast, never as an observation",
    ],
  },
  {
    id: "global",
    icon: Globe2,
    name: "Global Intelligence",
    status: "Available",
    body: "Explore global precipitation, surface-water, temperature and vegetation datasets, then open a local investigation from any region.",
    points: [
      "Verified NASA GIBS global raster layers with their real legends",
      "Coverage and temporal limitations stated per dataset",
      "No invented country rankings or global statistics",
    ],
  },
  {
    id: "ai",
    icon: Sparkles,
    name: "AI Intelligence",
    status: "Available",
    body: "An evidence-grounded interpretation of the actual analysis results, with the measurements and the reasoning kept separate.",
    points: [
      "Answers built only from structured module outputs",
      "Cites datasets and states uncertainty explicitly",
      "Never invents a value, a risk score or a warning",
    ],
  },
];

export function CapabilitiesSection() {
  return (
    <section id="capabilities" className="grid-lines border-t border-white/[0.06] py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-3xl">
          <p className="label-caps text-water-300">Platform capabilities</p>
          <h2 className="mt-3 text-balance font-display text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
            One platform, every water signal in one evidence-first workspace
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-300">
            Every capability below corresponds to a feature in the Explore Map workspace.
            Forecasts, observations, model outputs and derived indicators are labelled
            separately and never treated as interchangeable.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((module, i) => {
            const Icon = module.icon;
            return (
              <Reveal key={module.id} delayMs={i * 70}>
                <article
                  id={module.id}
                  className="panel group flex h-full flex-col p-5 transition-colors hover:border-water-400/25"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-water-400/25 bg-water-400/[0.08] text-water-300">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-signal-good/25 bg-signal-good/[0.08] px-2.5 py-1 text-[0.625rem] font-semibold uppercase tracking-wide text-signal-good">
                      <span className="h-1.5 w-1.5 rounded-full bg-signal-good" aria-hidden />
                      {module.status}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold text-ink-50">
                    {module.name}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-300">{module.body}</p>
                  <ul className="mt-4 space-y-1.5 border-t border-white/[0.06] pt-4">
                    {module.points.map((point) => (
                      <li key={point} className="flex gap-2 text-xs leading-relaxed text-ink-400">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-water-400/70" aria-hidden />
                        {point}
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
