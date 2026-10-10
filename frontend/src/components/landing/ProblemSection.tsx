/**
 * "The problem" section.
 *
 * Frames three genuine challenges without alarmism or invented global figures:
 * water conditions vary by region and season, so local evidence matters.
 */
import { CloudRain, Droplets, ScanSearch } from "lucide-react";

import { Reveal } from "@/components/landing/Reveal";

const CHALLENGES = [
  {
    icon: CloudRain,
    title: "Water stress & rainfall deficits",
    body: "Some regions receive consistently less rainfall than their historical norm. Persistent deficits can strain rivers, soils and reservoirs — but a rainfall deficit alone is not proof of water scarcity.",
  },
  {
    icon: Droplets,
    title: "Flood hazards & extreme rainfall",
    body: "Intense or prolonged rainfall can raise flood risk. Catchment shape, soil saturation and river levels determine the outcome, so heavy rainfall alone does not establish that a flood occurred.",
  },
  {
    icon: ScanSearch,
    title: "Fragmented environmental evidence",
    body: "Rain gauges, reanalysis, forecasts, models and satellites each describe water differently. Without clear provenance, these sources are easily confused or over-trusted.",
  },
];

export function ProblemSection() {
  return (
    <section id="problem" className="border-t border-white/[0.06] py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-3xl">
          <p className="label-caps text-water-300">The challenge</p>
          <h2 className="mt-3 text-balance font-display text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
            Water conditions vary — across regions and over time
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-300">
            There is no single global water signal. Attention is warranted where local
            evidence points to a deficit, an excess, or a gap in observations. AquaNexus
            helps you investigate each case with data you can trace.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {CHALLENGES.map((item, i) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.title} delayMs={i * 80}>
                <article className="panel h-full p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-water-300">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-sm font-semibold text-ink-100">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-400">{item.body}</p>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
