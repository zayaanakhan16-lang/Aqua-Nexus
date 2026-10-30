"use client";

/**
 * Future outlook panel.
 *
 * Shows the modelled forecast for the selected location: upcoming rainfall,
 * rainy/dry periods, heavy-rainfall indicators and the derived concern signals
 * the backend computes. Every value is labelled as a forecast or a derived
 * indicator, and the panel states plainly that AquaNexus issues no flood
 * probability — only rainfall-related concern indicators.
 */
import { CalendarClock, CloudRain, Info, Sun, TrendingUp } from "lucide-react";

import { RainfallChart } from "@/components/charts/RainfallChart";
import {
  ClassificationBadge,
  Chip,
  Panel,
  PanelHeader,
  Skeleton,
  StatusDot,
} from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { formatDate, formatNumber } from "@/lib/format";
import type { SliceState } from "@/lib/workspace";
import type { LocationOutlook, OutlookSignal } from "@/lib/schemas";

function SignalCard({ signal }: { signal: OutlookSignal }) {
  const tone = signal.status === "ok" ? "good" : signal.status === "partial" ? "caution" : "muted";
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-ink-200">{signal.label}</p>
        <ClassificationBadge classification={signal.classification} compact />
      </div>
      <p className="mt-1.5 flex items-baseline gap-1.5">
        <StatusDot tone={tone} label={signal.status} />
        <span className="font-mono text-lg font-semibold text-ink-50">
          {signal.value !== null && signal.value !== undefined
            ? formatNumber(signal.value, 1)
            : "—"}
        </span>
        <span className="text-xs text-ink-400">{signal.unit}</span>
      </p>
      <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-500">{signal.method}</p>
    </div>
  );
}

export function OutlookPanel({
  slice,
  onRetry,
}: {
  slice: SliceState<LocationOutlook>;
  onRetry: () => void;
}) {
  const data = slice.data;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Future outlook"
        subtitle="Modelled forecast and derived rainfall signals for this location"
        icon={<CalendarClock className="h-4 w-4" aria-hidden />}
      />
      <div className="space-y-4 p-4">
        <div className="flex items-start gap-2 rounded-lg border border-water-400/20 bg-water-400/[0.05] px-3 py-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-water-300" aria-hidden />
          <p className="text-xs leading-relaxed text-ink-200">
            Everything in this section is a forecast or a value derived from it. Forecasts are not
            observations, their skill falls with lead time, and AquaNexus does not issue a flood
            probability.
          </p>
        </div>

        {slice.loading && !data ? <Skeleton className="h-56 w-full" /> : null}
        {!slice.loading && slice.error ? (
          <ErrorState
            title="Forecast products unavailable"
            message={slice.error}
            onRetry={onRetry}
          />
        ) : null}

        {data ? (
          <>
            {data.signals.length ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.signals.map((signal) => (
                  <SignalCard key={signal.key} signal={signal} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<CloudRain className="h-5 w-5" aria-hidden />}
                title="No forecast signals returned"
                description="No forecast product returned usable data for this location."
              />
            )}

            {data.forecast ? (
              <div className="rounded-lg border border-white/[0.06] bg-abyss-950/40 p-3">
                <p className="label-caps mb-2">Forecast rainfall series</p>
                <RainfallChart forecast={data.forecast} height={220} />
                <p className="mt-2 text-[0.6875rem] text-ink-500">
                  Provider: {data.forecast.provider.name}
                  {data.forecast.total !== null && data.forecast.total !== undefined
                    ? ` · total ${formatNumber(data.forecast.total, 1)} ${data.forecast.unit}`
                    : ""}
                  {" · retrieved "}
                  {formatDate(data.forecast.provenance.retrieved_at)}
                </p>
              </div>
            ) : null}

            {data.rainy_periods.length || data.dry_periods.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {data.rainy_periods.length ? (
                  <div className="rounded-lg border border-water-400/20 bg-water-400/[0.05] px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-water-200">
                      <CloudRain className="h-3.5 w-3.5" aria-hidden />
                      Rainy forecast periods
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {data.rainy_periods.map((p) => (
                        <li key={p.start_date} className="text-[0.6875rem] text-ink-300">
                          {formatDate(p.start_date)} → {formatDate(p.end_date)} · {p.days} day
                          {p.days === 1 ? "" : "s"}
                          {p.total_mm !== null && p.total_mm !== undefined
                            ? ` · ${formatNumber(p.total_mm, 1)} mm`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {data.dry_periods.length ? (
                  <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-200">
                      <Sun className="h-3.5 w-3.5" aria-hidden />
                      Drier forecast periods
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {data.dry_periods.map((p) => (
                        <li key={p.start_date} className="text-[0.6875rem] text-ink-400">
                          {formatDate(p.start_date)} → {formatDate(p.end_date)} · {p.days} day
                          {p.days === 1 ? "" : "s"}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            {data.comparison ? (
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-200">
                  <TrendingUp className="h-3.5 w-3.5 text-water-300" aria-hidden />
                  Recent rainfall vs prior-year window
                </p>
                <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-400">
                  {data.comparison.classification?.label ?? "Anomaly"} ·{" "}
                  {data.comparison.anomaly_percent !== null &&
                  data.comparison.anomaly_percent !== undefined
                    ? `${formatNumber(data.comparison.anomaly_percent, 1)}% vs baseline`
                    : "percentage unavailable (baseline was zero)"}
                  . This is a reanalysis comparison, not a forecast.
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
              {data.providers.map((p) => (
                <span key={p.provider_id} className="inline-flex items-center gap-1.5">
                  <StatusDot
                    tone={p.status === "ok" ? "good" : p.status === "partial" ? "caution" : "muted"}
                    label={p.status}
                  />
                  <span className="text-[0.6875rem] text-ink-400">{p.provider_name}</span>
                </span>
              ))}
            </div>

            {data.limitations.length ? (
              <ul className="space-y-1">
                {data.limitations.map((limitation) => (
                  <li
                    key={limitation}
                    className="flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-ink-500"
                  >
                    <Info className="mt-0.5 h-3 w-3 shrink-0 text-ink-600" aria-hidden />
                    <span>{limitation}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
    </Panel>
  );
}
