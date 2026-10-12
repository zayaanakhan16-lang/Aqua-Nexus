"use client";

/**
 * Water stress tab panel.
 *
 * Builds an evidence-based view from the variables AquaNexus actually has:
 * the rainfall anomaly against a like-for-like prior-year window, the wet-day
 * fraction, data coverage and the cross-source difference. It is explicit that
 * rainfall alone cannot establish water scarcity — groundwater, reservoirs,
 * demand and infrastructure are not part of this build.
 */
import { AlertTriangle, Droplets, Info, Waves } from "lucide-react";

import { ClassificationBadge, Chip, Panel, PanelHeader, Skeleton, StatusDot } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import { formatNumber, indicatorStatusLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SliceState } from "@/lib/workspace";
import type { Indicator, LocationSummary } from "@/lib/schemas";

const KEYS = ["rainfall_anomaly", "wet_day_fraction", "coverage", "cross_check_delta"];

function IndicatorLine({ indicator }: { indicator: Indicator }) {
  const status = indicatorStatusLabel(indicator.status);
  const hasValue = indicator.value !== null && indicator.status === "ok";
  return (
    <div className="flex items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-3">
      <StatusDot
        tone={indicator.status === "ok" ? "good" : indicator.status === "unavailable" ? "alert" : "caution"}
        label={status.label}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-medium text-ink-100">{indicator.label}</p>
          <p className="shrink-0 font-mono text-sm text-ink-100">
            {hasValue ? (
              <>
                {formatNumber(indicator.value, indicator.unit === "ratio" ? 3 : 1)}
                <span className="ml-1 text-xs text-ink-400">{indicator.unit}</span>
              </>
            ) : (
              <span className={cn("font-sans text-xs", status.className)}>{status.label}</span>
            )}
          </p>
        </div>
        <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-400">{indicator.method}</p>
        {indicator.limitations[0] ? (
          <p className="mt-1 flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-ink-500">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-signal-caution" aria-hidden />
            <span>{indicator.limitations[0]}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function WaterStressPanel({
  slice,
  onRetry,
}: {
  slice: SliceState<LocationSummary>;
  onRetry: () => void;
}) {
  const data = slice.data;
  const byKey = new Map((data?.indicators ?? []).map((i) => [i.key, i]));
  const rows = KEYS.map((k) => byKey.get(k)).filter((i): i is Indicator => Boolean(i));

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Water stress"
        subtitle="Rainfall-based signals — not a scarcity verdict"
        icon={<Waves className="h-4 w-4" aria-hidden />}
      />
      <div className="space-y-4 p-4">
        <div className="flex items-start gap-2 rounded-lg border border-signal-caution/25 bg-signal-caution/[0.06] px-3 py-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-signal-caution" aria-hidden />
          <p className="text-xs leading-relaxed text-ink-200">
            Rainfall is one input among many. AquaNexus does not currently assess groundwater,
            reservoir storage, demand or infrastructure, so it cannot establish water scarcity from
            rainfall alone. These are rainfall-derived signals for investigation.
          </p>
        </div>

        {slice.loading && !data ? <Skeleton className="h-64 w-full" /> : null}
        {!slice.loading && slice.error ? (
          <ErrorState title="Water-stress signals unavailable" message={slice.error} onRetry={onRetry} />
        ) : null}

        {data ? (
          <>
            {rows.length ? (
              <div className="space-y-2">
                {rows.map((indicator) => (
                  <IndicatorLine key={indicator.key} indicator={indicator} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-400">No rainfall-derived indicators were returned.</p>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
              <Chip>
                <Droplets className="h-3 w-3" aria-hidden />
                {data.providers.filter((p) => p.status === "ok").length} of {data.providers.length}{" "}
                sources available
              </Chip>
              {data.indicators.some((i) => i.key === "rainfall_anomaly") ? (
                <ClassificationBadge classification="derived" compact />
              ) : null}
            </div>

            {data.notes.length ? (
              <ul className="space-y-1 text-[0.6875rem] leading-relaxed text-ink-500">
                {data.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
    </Panel>
  );
}
