"use client";

/**
 * River discharge tab panel.
 *
 * Shows the modelled GloFAS discharge series. Every value is labelled modelled
 * (classification: simulation); this panel never presents it as a gauge
 * reading, flood probability or alert. If the point is not near a modelled
 * river the provider returns no values and the panel explains that honestly.
 */
import { Droplets, Info } from "lucide-react";

import { DischargeChart } from "@/components/charts/DischargeChart";
import { ClassificationBadge, Chip, Panel, PanelHeader, Skeleton } from "@/components/ui/primitives";
import { ErrorState, UnavailableNotice } from "@/components/ui/states";
import { formatDate, formatNumber } from "@/lib/format";
import type { SliceState } from "@/lib/workspace";
import type { DischargeSeries } from "@/lib/schemas";

export function DischargePanel({
  slice,
  onRetry,
}: {
  slice: SliceState<DischargeSeries>;
  onRetry: () => void;
}) {
  const data = slice.data;
  const latest = data?.points.find((p) => p.discharge_m3s !== null) ?? null;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="River discharge"
        subtitle="Modelled GloFAS discharge — not a gauge measurement"
        icon={<Droplets className="h-4 w-4" aria-hidden />}
        actions={<ClassificationBadge classification="simulation" />}
      />
      <div className="space-y-4 p-4">
        {slice.loading && !data ? <Skeleton className="h-[280px] w-full" /> : null}

        {!slice.loading && slice.error ? (
          <>
            <ErrorState title="River discharge unavailable" message={slice.error} onRetry={onRetry} />
            <UnavailableNotice
              title="Why this may be empty"
              message="GloFAS is a modelled river network. If no modelled river passes near this point, discharge is not available — this is a coverage limitation, not a zero-flow reading."
            />
          </>
        ) : null}

        {data ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Chip title="Window covered by the series">
                {formatDate(data.start_date)} → {formatDate(data.end_date)}
              </Chip>
              <Chip title="Days with a modelled value">{data.valid_days} valid days</Chip>
              {data.missing_days > 0 ? (
                <Chip title="Days with no modelled value">{data.missing_days} missing</Chip>
              ) : null}
              {latest ? (
                <Chip title="First modelled value in the window">
                  Latest {formatNumber(latest.discharge_m3s, 1)} m³/s
                </Chip>
              ) : null}
              {data.historical_days ? (
                <Chip title="Reanalysis/hindcast days before today">
                  {data.historical_days} reanalysis days
                </Chip>
              ) : null}
              {data.forecast_days ? (
                <Chip title="Forecast days from today">
                  {data.forecast_days} forecast days
                </Chip>
              ) : null}
              {data.grid_cell ? (
                <Chip title="Provider-resolved model grid cell (~5 km resolution)">
                  Grid cell {data.grid_cell.latitude.toFixed(3)}, {data.grid_cell.longitude.toFixed(3)}
                </Chip>
              ) : null}
            </div>

            <div className="rounded-lg border border-white/[0.06] bg-abyss-950/40 p-2">
              <DischargeChart series={data} />
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2 text-[0.6875rem] leading-relaxed text-ink-400">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-water-300" aria-hidden />
              <span>
                {data.note} Source: {data.provider.name}
                {data.model ? ` · ${data.model}` : ""}
                {data.retrieved_at ? ` · retrieved ${new Date(data.retrieved_at).toUTCString()}` : ""}
                . Modelled discharge is a simulation and must not be read as a flood warning or a
                river-gauge record.
              </span>
            </div>
          </>
        ) : null}
      </div>
    </Panel>
  );
}
