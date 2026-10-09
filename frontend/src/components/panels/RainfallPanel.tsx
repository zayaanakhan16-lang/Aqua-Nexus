"use client";

/** Rainfall intelligence panel: series chart, anomaly, and source provenance. */
import { CloudRain, TrendingDown, TrendingUp, Minus } from "lucide-react";

import { RainfallChart } from "@/components/charts/RainfallChart";
import { ClassificationBadge, Chip, Panel, PanelHeader, Skeleton } from "@/components/ui/primitives";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { classificationStyle, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useWorkspace, type SliceState } from "@/lib/workspace";
import type { PrecipitationComparison, PrecipitationSeries } from "@/lib/schemas";

function AnomalyCard({ comparison }: { comparison: PrecipitationComparison | null }) {
  if (!comparison) return null;
  const pct = comparison.anomaly_percent;
  const band = comparison.classification.band;
  const positive = (pct ?? comparison.anomaly_mm) >= 0;
  const Icon = pct === null || Math.abs(pct) < 5 ? Minus : positive ? TrendingUp : TrendingDown;
  const tone =
    band === "near_normal"
      ? "text-ink-200"
      : positive
        ? "text-water-300"
        : "text-signal-caution";

  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="label-caps">Rainfall anomaly</p>
        <span className="text-[0.6875rem] text-ink-500">
          vs. {comparison.baseline_years.join(", ")}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <Icon className={cn("h-5 w-5", tone)} aria-hidden />
        <p className={cn("font-mono text-xl font-semibold", tone)}>
          {pct === null
            ? formatNumber(comparison.anomaly_mm, 1)
            : `${pct > 0 ? "+" : ""}${formatNumber(pct, 1)}%`}
        </p>
      </div>
      <p className="mt-1 text-xs text-ink-300">{comparison.classification.label}</p>
      {comparison.notes.length ? (
        <p className="mt-2 border-t border-white/[0.06] pt-2 text-[0.6875rem] leading-relaxed text-ink-500">
          {comparison.notes[0]}
        </p>
      ) : null}
    </div>
  );
}

export function RainfallPanel({
  comparison,
  forecast,
  onRetry,
}: {
  comparison: SliceState<PrecipitationComparison>;
  forecast: SliceState<PrecipitationSeries>;
  onRetry: () => void;
}) {
  const { windowDays, setWindowDays, location } = useWorkspace();
  const observed = comparison.data?.observed ?? null;

  const observedTotal = observed?.total ?? null;
  const sourceClass = observed?.provenance.classification;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Rainfall intelligence"
        subtitle="Observed reanalysis · historical baseline · forecast"
        icon={<CloudRain className="h-4 w-4" aria-hidden />}
        actions={
          <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5">
            {[30, 60, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setWindowDays(d)}
                aria-pressed={windowDays === d}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  windowDays === d
                    ? "bg-water-400/20 text-water-200"
                    : "text-ink-400 hover:text-ink-100",
                )}
              >
                {d}d
              </button>
            ))}
          </div>
        }
      />

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {sourceClass ? (
            <ClassificationBadge classification={sourceClass} />
          ) : (
            <Chip>Awaiting data</Chip>
          )}
          {observedTotal !== null ? (
            <Chip title="Total observed precipitation over the selected window">
              Window total {formatNumber(observedTotal, 1)} mm
            </Chip>
          ) : null}
          {observed ? (
            <Chip title="Missing days within the window">
              {observed.missing_days} missing day{observed.missing_days === 1 ? "" : "s"}
            </Chip>
          ) : null}
        </div>

        {comparison.loading && !comparison.data && forecast.loading && !forecast.data ? (
          <Skeleton className="h-[300px] w-full" />
        ) : null}

        {!location ? (
          <EmptyState
            icon={<CloudRain className="h-5 w-5" aria-hidden />}
            title="Select a location to analyse rainfall"
            description="Search for a city, river or lake — or click anywhere on the map — to load its rainfall history, baseline comparison and forecast."
          />
        ) : null}

        {location && comparison.error && !comparison.data ? (
          <ErrorState
            title="Rainfall data unavailable"
            message={comparison.error}
            onRetry={onRetry}
          />
        ) : null}

        {comparison.data || forecast.data ? (
          <div className="rounded-lg border border-white/[0.06] bg-abyss-950/40 p-2">
            <RainfallChart
              observed={comparison.data?.observed}
              baseline={comparison.data?.baseline}
              forecast={forecast.data}
            />
          </div>
        ) : null}

        {forecast.error && !forecast.data && location ? (
          <p className="text-xs text-signal-alert">
            Forecast series unavailable: {forecast.error}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <AnomalyCard comparison={comparison.data} />
          {forecast.data ? (
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="flex items-center justify-between">
                <p className="label-caps">7-day forecast total</p>
                {forecast.data.provenance ? (
                  <ClassificationBadge
                    classification={forecast.data.provenance.classification}
                    compact
                  />
                ) : null}
              </div>
              <p className="mt-1.5 font-mono text-xl font-semibold text-teal-400">
                {formatNumber(forecast.data.total, 1)}
                <span className="ml-1 text-xs text-ink-400">mm</span>
              </p>
              <p className={cn("mt-1 text-xs", classificationStyle("forecast").className)}>
                Modelled prediction — not an observation
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
