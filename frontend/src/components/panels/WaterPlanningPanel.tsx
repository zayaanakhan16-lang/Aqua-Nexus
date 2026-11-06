"use client";

/**
 * Water planning workspace for the selected region.
 *
 * Mirrors the AgriSense planning surface: a scrollable page of details, then
 * recommendation cards, then a season-by-month planning table.
 *
 * The recommendations are derived from real signals where a signal exists
 * (a rainfall anomaly, a mapped water body count, an absent groundwater
 * source) and are labelled illustrative throughout. They are planning prompts
 * for a human to assess — never presented as verified engineering advice, and
 * never carrying a number that was not measured.
 */
import { AlertTriangle, CalendarRange, Droplets, Info, Lightbulb, MapPin } from "lucide-react";

import { Chip, Panel, PanelHeader, StatusDot } from "@/components/ui/primitives";
import { UnavailableNotice } from "@/components/ui/states";
import { formatCoord } from "@/lib/format";
import { useMapUi } from "@/lib/map-ui";
import type { StudyArea } from "@/lib/schemas";
import type { SliceState } from "@/lib/workspace";
import type { DischargeSeries, LocationSummary, WaterBodyResult, WeatherForecast } from "@/lib/schemas";

const SEASONS = [
  { id: "winter", label: "Winter", months: [12, 1, 2], note: "Low evaporation; recharge window in many temperate basins." },
  { id: "spring", label: "Spring", months: [3, 4, 5], note: "Snowmelt and rising flows; storage refill." },
  { id: "summer", label: "Summer", months: [6, 7, 8], note: "Peak demand; lowest natural flows." },
  { id: "autumn", label: "Autumn", months: [9, 10, 11], note: "Receding flows; drawdown and maintenance." },
] as const;

const MONTH_LABELS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/**
 * General water-management practices. Deliberately generic — they are the same
 * for every region, so they are labelled as suggestions rather than presented as
 * guidance computed for the selected area.
 */
const EXPERT_TIPS = [
  {
    title: "Meter and fix leaks first",
    body: "Reducing distribution losses is usually cheaper than new supply, and it needs measured consumption data to target.",
  },
  {
    title: "Match irrigation to soil moisture",
    body: "Scheduling from measured soil-moisture or evapotranspiration data avoids over-irrigation; fixed calendars ignore rainfall.",
  },
  {
    title: "Protect the recharge area",
    body: "Watershed and riparian buffers slow runoff and support infiltration, which sustains baseflow between rain events.",
  },
  {
    title: "Separate supply from quality",
    body: "A source can be plentiful and still unfit for a use. Confirm quality against a stated standard before allocating it.",
  },
] as const;

interface Recommendation {
  title: string;
  body: string;
  context: string;
  basis: string;
  confidence: "well-supported" | "indicative" | "exploratory";
}

/**
 * Build recommendations from the signals actually present. A recommendation is
 * only offered when its trigger is observable in the data; the wording never
 * asserts a measured outcome.
 */
function buildRecommendations({
  rainfallAnomaly,
  wetDayFraction,
  mappedBodies,
  dischargePoints,
  hasGroundwater,
  regionType,
}: {
  rainfallAnomaly: number | null;
  wetDayFraction: number | null;
  mappedBodies: number | null;
  dischargePoints: number;
  hasGroundwater: boolean;
  regionType: string;
}): Recommendation[] {
  const out: Recommendation[] = [];

  if (rainfallAnomaly !== null && rainfallAnomaly < 0) {
    out.push({
      title: "Rainwater harvesting",
      body: "Rainfall is running below the prior-year comparison. Capturing runoff from roofs and hardstanding can offset part of the deficit, subject to local storage and water-quality rules.",
      context: `Rainfall anomaly for the selected window is ${rainfallAnomaly.toFixed(1)}%.`,
      basis: "Derived from the rainfall anomaly indicator for this location.",
      confidence: "indicative",
    });
  }

  if (wetDayFraction !== null && wetDayFraction < 0.3) {
    out.push({
      title: "Water conservation measures",
      body: "A low share of wet days suggests rainfall arrives in fewer, heavier events. Demand-side measures — leak reduction, metering, staged restrictions — usually matter more than additional capture.",
      context: `Wet-day fraction is ${wetDayFraction.toFixed(2)} over the window.`,
      basis: "Derived from the wet-day fraction indicator for this location.",
      confidence: "indicative",
    });
  }

  out.push({
    title: "Seasonal abstraction scheduling",
    body: "Align abstraction and storage decisions with the seasonal table below. The table is a planning frame, not a prediction — pair it with the live outlook before committing to a schedule.",
    context: `Region classified as ${regionType}.`,
    basis: "Planning frame; no measurement attached.",
    confidence: "exploratory",
  });

  if (mappedBodies !== null && mappedBodies > 0) {
    out.push({
      title: "Reservoir and water-body monitoring",
      body: "Mapped water features fall inside or near this region. Repeat satellite observation can track surface extent over time without field instrumentation.",
      context: `${mappedBodies} mapped water feature${mappedBodies === 1 ? "" : "s"} returned for this location.`,
      basis: "Derived from the mapped water-body query (OpenStreetMap).",
      confidence: "well-supported",
    });
  }

  if (dischargePoints > 0) {
    out.push({
      title: "Irrigation efficiency",
      body: "A modelled discharge series is available for this location. Comparing abstraction timing against modelled flow is the usual first step before changing an irrigation schedule.",
      context: `${dischargePoints} modelled discharge points available.`,
      basis: "Derived from the modelled river-discharge series (not a gauge measurement).",
      confidence: "indicative",
    });
  }

  out.push({
    title: "Watershed protection",
    body: "Boundary vegetation, riparian buffers and erosion control protect the catchment that feeds this region. These are structural measures that need local hydrological survey before design.",
    context: hasGroundwater
      ? "A groundwater source is connected for this region."
      : "No groundwater source is connected for this region — the subsurface pathway is unquantified here.",
    basis: hasGroundwater
      ? "Region context; no measurement attached."
      : "Stated limitation: groundwater is not connected in this build.",
    confidence: "exploratory",
  });

  return out;
}

const CONFIDENCE_TONE: Record<Recommendation["confidence"], { tone: "good" | "caution" | "muted"; label: string }> = {
  "well-supported": { tone: "good", label: "Well-supported" },
  indicative: { tone: "caution", label: "Indicative" },
  exploratory: { tone: "muted", label: "Exploratory" },
};

export function WaterPlanningPanel({
  area,
  areaKm2,
  summary,
  weather,
  discharge,
  waterBodies,
  windowDays,
  onWindowChange,
}: {
  area: StudyArea | null;
  areaKm2?: number | null;
  summary: SliceState<LocationSummary>;
  weather: SliceState<WeatherForecast>;
  discharge: SliceState<DischargeSeries>;
  waterBodies: SliceState<WaterBodyResult>;
  windowDays: number;
  onWindowChange: (days: number) => void;
}) {
  const { annotationFor } = useMapUi();
  const annotation = area ? annotationFor(area.id) : null;
  const data = summary.data;

  const indicatorValue = (key: string): number | null => {
    const i = data?.indicators.find((x) => x.key === key);
    return i && i.status === "ok" ? i.value : null;
  };

  const rainfallAnomaly = indicatorValue("rainfall_anomaly");
  const wetDayFraction = indicatorValue("wet_day_fraction");
  const hasGroundwater = false;

  const recommendations = buildRecommendations({
    rainfallAnomaly,
    wetDayFraction,
    mappedBodies: waterBodies.data?.count ?? null,
    dischargePoints: discharge.data?.points.length ?? 0,
    hasGroundwater,
    regionType: annotation?.regionType ?? "Unclassified",
  });

  const okCount = data?.providers.filter((p) => p.status === "ok").length ?? 0;

  return (
    <div className="space-y-4">
      <Panel className="overflow-hidden">
        <PanelHeader
          title="Water planning"
          subtitle="Planning details and objectives for the selected region"
          icon={<CalendarRange className="h-4 w-4" aria-hidden />}
        />
        <div className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
              <p className="label-caps">Selected region</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-medium text-ink-100">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-water-300" aria-hidden />
                <span className="truncate">
                  {area?.name ?? data?.label ?? "No region selected"}
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
              <p className="label-caps">Region area</p>
              <p className="mt-1 font-mono text-sm tabular-nums text-ink-100">
                {areaKm2 != null
                  ? `${areaKm2.toLocaleString(undefined, { maximumFractionDigits: 2 })} km²`
                  : "Not recorded"}
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
              <p className="label-caps">Water resource type</p>
              <p className="mt-1 text-sm font-medium text-ink-100">
                {annotation?.waterResource ?? "Not classified"}
              </p>
            </div>
          </div>

          {/* -------------------------------------------------- planning period */}
          <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="label-caps">Planning period</p>
                <p className="mt-1 text-xs text-ink-300">
                  The window the availability signals below are computed over.
                </p>
              </div>
              <div className="flex items-center gap-1">
                {[7, 14, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => onWindowChange(days)}
                    aria-pressed={windowDays === days}
                    className={
                      windowDays === days
                        ? "rounded-md bg-ink-100 px-2.5 py-1 font-mono text-2xs font-semibold tabular-nums text-abyss-950"
                        : "rounded-md border border-white/10 px-2.5 py-1 font-mono text-2xs tabular-nums text-ink-300 transition hover:text-ink-50"
                    }
                  >
                    {days}d
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ------------------------------------------------ available data */}
          <div>
            <p className="label-caps">Available water data</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Chip title="Providers that returned usable data">
                <Droplets className="h-3 w-3" aria-hidden />
                {okCount} of {data?.providers.length ?? 0} sources available
              </Chip>
              {rainfallAnomaly !== null ? (
                <Chip>Rainfall anomaly {rainfallAnomaly.toFixed(1)}%</Chip>
              ) : (
                <Chip className="text-ink-500">Rainfall anomaly unavailable</Chip>
              )}
              {wetDayFraction !== null ? (
                <Chip>Wet-day fraction {wetDayFraction.toFixed(2)}</Chip>
              ) : null}
              <Chip className="text-ink-500">Groundwater not connected</Chip>
            </div>
          </div>

          <UnavailableNotice
            title="Planning objective"
            message="No planning objective has been set for this region. Objectives are not inferred from the data — set one when the assessment is complete, so the recommendations below are judged against a stated goal."
          />
        </div>
      </Panel>

      {/* -------------------------------------------- recommendation cards */}
      <Panel className="overflow-hidden">
        <PanelHeader
          title="Water management recommendations"
          subtitle="Generated from this region's available signals"
          icon={<Lightbulb className="h-4 w-4" aria-hidden />}
        />
        <div className="p-4">
          <div className="flex items-start gap-2 rounded-lg border border-signal-caution/25 bg-signal-caution/[0.06] px-3 py-2.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-signal-caution" aria-hidden />
            <p className="text-xs leading-relaxed text-ink-200">
              These recommendations are illustrative planning prompts, not engineering or
              environmental advice. Each one states the signal it came from and how far it can be
              relied on. Confirm anything structural with a local hydrological survey.
            </p>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {recommendations.map((rec) => {
              const conf = CONFIDENCE_TONE[rec.confidence];
              return (
                <article
                  key={rec.title}
                  className="flex flex-col rounded-lg border border-white/[0.07] bg-white/[0.015] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-ink-100">{rec.title}</h3>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <StatusDot tone={conf.tone} label={conf.label} />
                      <span className="text-3xs uppercase tracking-[0.08em] text-ink-400">
                        {conf.label}
                      </span>
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-ink-300">{rec.body}</p>
                  <div className="mt-2.5 space-y-1 border-t border-white/[0.06] pt-2.5">
                    <p className="text-3xs leading-relaxed text-ink-400">
                      <span className="font-semibold text-ink-300">Region context:</span>{" "}
                      {rec.context}
                    </p>
                    <p className="flex items-start gap-1.5 text-3xs leading-relaxed text-ink-500">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-signal-caution" aria-hidden />
                      <span>{rec.basis}</span>
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </Panel>

      {/* -------------------------------------------------- seasonal table */}
      <Panel className="overflow-hidden">
        <PanelHeader
          title="Seasonal water planning"
          subtitle="Planning frame by season and month — not a forecast"
          icon={<CalendarRange className="h-4 w-4" aria-hidden />}
        />
        <div className="overflow-x-auto p-4">
          <table className="w-full min-w-[44rem] border-separate border-spacing-0 text-left">
            <caption className="sr-only">
              Water management activities by season and month for the selected region
            </caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-abyss-950/0 pb-2 pr-3 text-left">
                  <span className="label-caps">Season</span>
                </th>
                {MONTH_LABELS.map((m, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="pb-2 text-center font-mono text-3xs font-semibold uppercase tracking-wide text-ink-400"
                  >
                    <span aria-hidden>{m}</span>
                    <span className="sr-only">{`Month ${i + 1}`}</span>
                  </th>
                ))}
                <th scope="col" className="pb-2 pl-3 text-left">
                  <span className="label-caps">Typical focus</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {SEASONS.map((season) => (
                <tr key={season.id}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-t border-white/[0.06] bg-abyss-950/0 py-2 pr-3 text-left text-xs font-medium text-ink-200"
                  >
                    {season.label}
                  </th>
                  {MONTH_LABELS.map((_, monthIndex) => {
                    const month = monthIndex + 1;
                    const active = (season.months as readonly number[]).includes(month);
                    return (
                      <td
                        key={month}
                        className="border-t border-white/[0.06] px-0.5 py-2 text-center"
                      >
                        <span
                          className={
                            active
                              ? "mx-auto block h-2.5 w-2.5 rounded-[3px] bg-water-300/70 ring-1 ring-water-300/40"
                              : "mx-auto block h-2.5 w-2.5 rounded-[3px] bg-white/[0.05]"
                          }
                          aria-label={active ? `${season.label}, month ${month}` : undefined}
                        />
                      </td>
                    );
                  })}
                  <td className="border-t border-white/[0.06] py-2 pl-3 text-2xs leading-relaxed text-ink-400">
                    {season.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-3 text-3xs leading-relaxed text-ink-500">
            Seasonal grouping is a planning convention, not a measurement. It does not describe
            observed conditions for this region, and it varies with hemisphere and climate zone.
          </p>
        </div>
      </Panel>

      {/* ------------------------------------------------------- expert tips */}
      <Panel className="overflow-hidden">
        <PanelHeader
          title="Expert tips"
          subtitle="General water-management guidance — suggestions, not local advice"
          icon={<Lightbulb className="h-4 w-4" aria-hidden />}
        />
        <div className="space-y-3 p-4">
          <p className="text-2xs leading-relaxed text-ink-400">
            These are general practices drawn from standard water-management guidance. They are not
            tailored to this region, are not verified local guidance, and should be checked against
            local regulation and site conditions before use.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {EXPERT_TIPS.map((tip) => (
              <li
                key={tip.title}
                className="flex items-start gap-2 rounded-lg border border-white/[0.07] bg-white/[0.015] px-3 py-2.5"
              >
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-water-300" aria-hidden />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ink-100">{tip.title}</p>
                  <p className="mt-0.5 text-2xs leading-relaxed text-ink-400">{tip.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </div>
  );
}
