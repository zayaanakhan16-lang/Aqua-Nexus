"use client";

/**
 * Water resource profile for the selected region.
 *
 * Answers "what do we actually know about this place, and what is missing?".
 * Each category resolves its own state from the workspace slices that back it,
 * so a category with no source reports an explicit unavailable state rather
 * than an empty shell or an invented figure. Groundwater and water quality have
 * no provider in this build, and say so.
 */
import { AlertTriangle, Database, Droplets, MapPin, Ruler, Waves } from "lucide-react";

import { ClassificationBadge, Chip, Panel, PanelHeader, Skeleton, StatusDot } from "@/components/ui/primitives";
import { ErrorState, UnavailableNotice } from "@/components/ui/states";
import { formatCoord } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMapUi } from "@/lib/map-ui";
import type { StudyArea } from "@/lib/schemas";
import type { SliceState } from "@/lib/workspace";
import type {
  DischargeSeries,
  LocationSummary,
  WaterBodyResult,
  WaterPresenceResult,
  WeatherForecast,
} from "@/lib/schemas";

type Availability = "available" | "partial" | "unavailable" | "loading";

interface CategoryRow {
  label: string;
  state: Availability;
  detail: string;
  unit?: string | null;
}

/** One category block: a heading, its rows, and an explanation when empty. */
function Category({
  title,
  icon,
  rows,
  unavailableReason,
}: {
  title: string;
  icon: React.ReactNode;
  rows: CategoryRow[];
  unavailableReason?: string;
}) {
  const usable = rows.filter((r) => r.state === "available" || r.state === "partial");
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.015]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <span className="text-water-300">{icon}</span>
        <h3 className="text-2xs font-semibold uppercase tracking-[0.1em] text-ink-200">{title}</h3>
      </div>
      {usable.length ? (
        <dl className="divide-y divide-white/[0.05]">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-3 px-3 py-2">
              <dt className="flex min-w-0 items-center gap-2">
                <StatusDot
                  tone={
                    row.state === "available"
                      ? "good"
                      : row.state === "partial"
                        ? "caution"
                        : row.state === "loading"
                          ? "info"
                          : "muted"
                  }
                  label={row.state}
                />
                <span className="truncate text-xs text-ink-200">{row.label}</span>
              </dt>
              <dd className="shrink-0 text-right">
                {row.state === "available" || row.state === "partial" ? (
                  <span className="font-mono text-xs tabular-nums text-ink-100">
                    {row.detail}
                    {row.unit ? <span className="ml-1 text-ink-400">{row.unit}</span> : null}
                  </span>
                ) : (
                  <span className="text-2xs text-ink-500">
                    {row.state === "loading" ? "Loading…" : "Not available"}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="px-3 py-2.5">
          <p className="text-2xs leading-relaxed text-ink-500">
            {unavailableReason ?? "No connected source provides this category for this region."}
          </p>
        </div>
      )}
    </div>
  );
}

export function WaterProfilePanel({
  area,
  areaKm2,
  summary,
  weather,
  discharge,
  waterBodies,
  waterPresence,
  onRetry,
}: {
  area: StudyArea | null;
  /** Validated boundary area from the active selection, when one is drawn. */
  areaKm2?: number | null;
  summary: SliceState<LocationSummary>;
  weather: SliceState<WeatherForecast>;
  discharge: SliceState<DischargeSeries>;
  waterBodies: SliceState<WaterBodyResult>;
  waterPresence: SliceState<WaterPresenceResult>;
  onRetry: () => void;
}) {
  const { annotationFor } = useMapUi();
  const annotation = area ? annotationFor(area.id) : null;
  const data = summary.data;

  const providerState = (id: string): Availability => {
    const p = data?.providers.find((x) => x.provider_id === id);
    if (!p) return summary.loading ? "loading" : "unavailable";
    return p.status === "ok" ? "available" : p.status === "partial" ? "partial" : "unavailable";
  };

  const indicator = (key: string) => data?.indicators.find((i) => i.key === key) ?? null;

  // ---------------------------------------------------------- surface water
  const bodyCount = waterBodies.data?.count ?? null;
  const surfaceRows: CategoryRow[] = [
    {
      label: "Mapped water features",
      state: waterBodies.loading
        ? "loading"
        : bodyCount === null
          ? "unavailable"
          : bodyCount > 0
            ? "available"
            : "unavailable",
      detail: bodyCount === null ? "" : String(bodyCount),
      unit: bodyCount === null ? null : "features",
    },
    {
      label: "Surface water presence",
      state: waterPresence.loading
        ? "loading"
        : waterPresence.data
          ? waterPresence.data.status === "insufficient_evidence" ||
            waterPresence.data.status === "unavailable"
            ? "unavailable"
            : "available"
          : "unavailable",
      detail: waterPresence.data?.status.replace(/_/g, " ") ?? "",
    },
  ];

  // -------------------------------------------------------- rainfall/climate
  const current = weather.data?.current ?? null;
  const climateRows: CategoryRow[] = [
    {
      label: "Temperature",
      state: current?.temperature_c != null ? "available" : weather.loading ? "loading" : "unavailable",
      detail: current?.temperature_c != null ? current.temperature_c.toFixed(1) : "",
      unit: "°C",
    },
    {
      label: "Precipitation",
      state:
        current?.precipitation_mm != null ? "available" : weather.loading ? "loading" : "unavailable",
      detail: current?.precipitation_mm != null ? current.precipitation_mm.toFixed(1) : "",
      unit: "mm",
    },
    {
      label: "Relative humidity",
      state:
        current?.relative_humidity_pct != null
          ? "available"
          : weather.loading
            ? "loading"
            : "unavailable",
      detail:
        current?.relative_humidity_pct != null ? current.relative_humidity_pct.toFixed(0) : "",
      unit: "%",
    },
    {
      label: "Wind speed",
      state:
        current?.wind_speed_kmh != null ? "available" : weather.loading ? "loading" : "unavailable",
      detail: current?.wind_speed_kmh != null ? current.wind_speed_kmh.toFixed(1) : "",
      unit: "km/h",
    },
  ];

  // ---------------------------------------------------- hydrological condition
  const rainfallAnomaly = indicator("rainfall_anomaly");
  const wetDayFraction = indicator("wet_day_fraction");
  const hydroRows: CategoryRow[] = [
    {
      label: "River discharge",
      state: discharge.loading
        ? "loading"
        : discharge.data && discharge.data.points.length
          ? "available"
          : "unavailable",
      detail: discharge.data?.points.length ? String(discharge.data.points.length) : "",
      unit: discharge.data?.points.length ? `points (${discharge.data.unit})` : null,
    },
    {
      label: "Rainfall anomaly",
      state:
        rainfallAnomaly?.status === "ok" && rainfallAnomaly.value !== null
          ? "available"
          : rainfallAnomaly
            ? "unavailable"
            : "loading",
      detail:
        rainfallAnomaly?.status === "ok" && rainfallAnomaly.value !== null
          ? rainfallAnomaly.value.toFixed(1)
          : "",
      unit: rainfallAnomaly?.unit ?? null,
    },
    {
      label: "Wet-day fraction",
      state:
        wetDayFraction?.status === "ok" && wetDayFraction.value !== null
          ? "available"
          : wetDayFraction
            ? "unavailable"
            : "loading",
      detail:
        wetDayFraction?.status === "ok" && wetDayFraction.value !== null
          ? wetDayFraction.value.toFixed(2)
          : "",
      unit: wetDayFraction?.unit ?? null,
    },
  ];

  // ------------------------------------------------------------- unavailable
  // No provider in this build supplies groundwater or water-quality series, so
  // these categories carry no rows at all rather than placeholder metrics.
  const groundwaterRows: CategoryRow[] = [];
  const qualityRows: CategoryRow[] = [];

  // Named explicitly so the gap is legible: these are the parameters a
  // water-quality source would report, and none of them is connected here.
  const QUALITY_PARAMETERS =
    "pH, turbidity, electrical conductivity, total dissolved solids, dissolved oxygen, nitrates, salinity";

  const okCount = data?.providers.filter((p) => p.status === "ok").length ?? 0;
  const totalCount = data?.providers.length ?? 0;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Water resource profile"
        subtitle="What is known about this region, and what is missing"
        icon={<Droplets className="h-4 w-4" aria-hidden />}
        actions={<Chip title="Providers that returned usable data">{okCount} of {totalCount} sources</Chip>}
      />

      <div className="space-y-4 p-4">
        {/* ---------------------------------------------------- region identity */}
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="label-caps">Region</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-ink-100">
                <MapPin className="h-4 w-4 shrink-0 text-water-300" aria-hidden />
                <span className="truncate">{area?.name ?? data?.label ?? "No region selected"}</span>
              </p>
              {area?.place?.display_name ? (
                <p className="mt-0.5 truncate text-2xs text-ink-500">{area.place.display_name}</p>
              ) : null}
            </div>
            {area ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {annotation ? <Chip>{annotation.regionType}</Chip> : null}
                {annotation ? <Chip>{annotation.waterResource}</Chip> : null}
              </div>
            ) : null}
          </div>

          <div className="mt-3 grid gap-3 border-t border-white/[0.06] pt-3 sm:grid-cols-3">
            <div>
              <p className="label-caps flex items-center gap-1.5">
                <Ruler className="h-3 w-3" aria-hidden />
                Area
              </p>
              <p className="mt-1 font-mono text-xs tabular-nums text-ink-200">
                {areaKm2 != null
                  ? `${areaKm2.toLocaleString(undefined, { maximumFractionDigits: 2 })} km²`
                  : "Not recorded"}
              </p>
            </div>
            <div>
              <p className="label-caps">Location</p>
              <p className="mt-1 font-mono text-xs tabular-nums text-ink-200">
                {area
                  ? `${formatCoord(area.location.latitude, "lat")} · ${formatCoord(area.location.longitude, "lon")}`
                  : data?.location
                    ? `${formatCoord(data.location.latitude, "lat")} · ${formatCoord(data.location.longitude, "lon")}`
                    : "No location selected"}
              </p>
            </div>
            <div>
              <p className="label-caps">Last data update</p>
              <p className="mt-1 font-mono text-xs tabular-nums text-ink-200">
                {data?.generated_at
                  ? new Date(data.generated_at).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "No response yet"}
              </p>
            </div>
          </div>
        </div>

        {summary.error ? (
          <ErrorState message={summary.error} onRetry={onRetry} />
        ) : null}

        {/* ------------------------------------------------------ categories */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Category
            title="Surface water"
            icon={<Waves className="h-3.5 w-3.5" aria-hidden />}
            rows={surfaceRows}
            unavailableReason="No mapped water feature was returned near this region, and the surface-water presence check found no conclusive evidence."
          />
          <Category
            title="Rainfall & climate"
            icon={<Droplets className="h-3.5 w-3.5" aria-hidden />}
            rows={climateRows}
            unavailableReason="The weather provider returned no current observation for this region."
          />
          <Category
            title="Hydrological conditions"
            icon={<Waves className="h-3.5 w-3.5" aria-hidden />}
            rows={hydroRows}
            unavailableReason="No hydrological source returned a series for this region."
          />
          <Category
            title="Groundwater"
            icon={<Database className="h-3.5 w-3.5" aria-hidden />}
            rows={groundwaterRows}
            unavailableReason="Groundwater level and storage are not connected in this build. No provider supplies them, so no value is shown."
          />
          <Category
            title="Water quality"
            icon={<Database className="h-3.5 w-3.5" aria-hidden />}
            rows={qualityRows}
            unavailableReason={`Water-quality indicators (${QUALITY_PARAMETERS}) are not connected in this build. No provider supplies them, so no value is shown.`}
          />
        </div>

        {/* ------------------------------------------------ quality suitability */}
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.015] p-3">
          <div className="flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-water-300" aria-hidden />
            <h3 className="text-2xs font-semibold uppercase tracking-[0.1em] text-ink-200">
              Water suitability
            </h3>
          </div>
          <p className="mt-2 text-2xs leading-relaxed text-ink-400">
            Insufficient water-quality data to determine suitability. Drinking-water and irrigation
            suitability require measured parameters assessed against a stated standard; satellite
            imagery alone cannot establish that water is safe to drink.
          </p>
        </div>

        {/* --------------------------------------------------- source ledger */}
        <div>
          <h3 className="label-caps flex items-center gap-1.5">
            <Database className="h-3 w-3" aria-hidden />
            Connected data sources
          </h3>
          {data?.providers.length ? (
            <ul className="mt-2 divide-y divide-white/[0.05] rounded-lg border border-white/[0.07]">
              {data.providers.map((p) => (
                <li key={p.provider_id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <StatusDot
                      tone={
                        p.status === "ok" ? "good" : p.status === "partial" ? "caution" : "alert"
                      }
                      label={p.status}
                    />
                    <span className="truncate text-xs text-ink-200">{p.provider_name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {p.classification ? (
                      <ClassificationBadge classification={p.classification} compact />
                    ) : null}
                    {p.preliminary ? (
                      <span className="text-3xs text-signal-caution">preliminary</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : summary.loading ? (
            <div className="mt-2 space-y-1.5">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <UnavailableNotice
              title="No source responded"
              message="The provider catalogue did not return a status for this region. Values cannot be reported until a source responds."
              className="mt-2"
            />
          )}
        </div>

        {providerState("groundwater") === "unavailable" ? (
          <p className="flex items-start gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-3xs leading-relaxed text-ink-500">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-signal-caution" aria-hidden />
            <span>
              Groundwater and water-quality categories are listed so the gap is visible. They carry
              no values because no connected provider measures them — they are not estimated here.
            </span>
          </p>
        ) : null}

        {!area ? (
          <p className={cn("text-2xs leading-relaxed text-ink-400")}>
            Select a saved region to see its profile. Values above reflect the current map selection.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
