"use client";

/**
 * Weather tab panel.
 *
 * Presents modelled current conditions and the daily forecast timeline from
 * Open-Meteo. Current values are the model's latest step and are labelled as
 * modelled, not observed. Provider failure renders an explicit unavailable
 * state rather than placeholder numbers.
 */
import { CloudRain, Droplets, Thermometer, Wind } from "lucide-react";

import { WeatherChart } from "@/components/charts/WeatherChart";
import { ClassificationBadge, Chip, Panel, PanelHeader, Skeleton } from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { formatDateTime, formatNumber } from "@/lib/format";
import { weatherCodeLabel } from "@/lib/weather";
import type { SliceState } from "@/lib/workspace";
import type { WeatherForecast } from "@/lib/schemas";

function Metric({
  icon: Icon,
  label,
  value,
  unit,
}: {
  icon: typeof Thermometer;
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="flex items-center gap-1.5 text-ink-400">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        <span className="text-[0.6875rem] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1.5 font-mono text-lg font-semibold text-ink-100">
        {value}
        {unit ? <span className="ml-1 text-xs font-normal text-ink-400">{unit}</span> : null}
      </p>
    </div>
  );
}

export function WeatherPanel({
  slice,
  onRetry,
}: {
  slice: SliceState<WeatherForecast>;
  onRetry: () => void;
}) {
  const data = slice.data;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Weather"
        subtitle="Modelled current conditions and daily forecast"
        icon={<Thermometer className="h-4 w-4" aria-hidden />}
        actions={data ? <ClassificationBadge classification={data.provenance.classification} /> : null}
      />
      <div className="space-y-4 p-4">
        {slice.loading && !data ? <Skeleton className="h-[300px] w-full" /> : null}

        {!slice.loading && slice.error ? (
          <ErrorState title="Weather unavailable" message={slice.error} onRetry={onRetry} />
        ) : null}

        {!slice.loading && !slice.error && !data ? (
          <EmptyState
            icon={<Thermometer className="h-5 w-5" aria-hidden />}
            title="No weather data for this location"
            description="The forecast provider returned nothing for this point."
          />
        ) : null}

        {data ? (
          <>
            {data.current ? (
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="label-caps">Current (modelled)</p>
                  <Chip title="Timestamp of the model's latest step">
                    {formatDateTime(data.current.timestamp)}
                  </Chip>
                  {weatherCodeLabel(data.current.weather_code) ? (
                    <Chip>{weatherCodeLabel(data.current.weather_code)}</Chip>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric
                    icon={Thermometer}
                    label="Temperature"
                    value={formatNumber(data.current.temperature_c, 1)}
                    unit="°C"
                  />
                  <Metric
                    icon={Thermometer}
                    label="Feels like"
                    value={formatNumber(data.current.apparent_temperature_c, 1)}
                    unit="°C"
                  />
                  <Metric
                    icon={Droplets}
                    label="Humidity"
                    value={formatNumber(data.current.relative_humidity_pct, 0)}
                    unit="%"
                  />
                  <Metric
                    icon={Wind}
                    label="Wind"
                    value={formatNumber(data.current.wind_speed_kmh, 1)}
                    unit="km/h"
                  />
                </div>
              </div>
            ) : null}

            {data.daily.length ? (
              <div>
                <p className="label-caps mb-2">Daily forecast</p>
                <div className="rounded-lg border border-white/[0.06] bg-abyss-950/40 p-2">
                  <WeatherChart forecast={data} />
                </div>
              </div>
            ) : null}

            <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2 text-[0.6875rem] leading-relaxed text-ink-400">
              <p className="flex items-start gap-1.5">
                <CloudRain className="mt-0.5 h-3.5 w-3.5 shrink-0 text-water-300" aria-hidden />
                <span>
                  Source: {data.provider.name}. {data.notes[0] ?? ""}
                </span>
              </p>
            </div>
          </>
        ) : null}
      </div>
    </Panel>
  );
}
