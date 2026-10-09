"use client";

/**
 * Location intelligence panel.
 *
 * Renders the evidence-backed summary for the selected point. Indicators that
 * could not be computed are shown as explicitly unavailable with their method
 * and limitations, rather than being hidden or replaced with a value.
 */
import { useId, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  Database,
  Gauge,
  Info,
  RefreshCw,
  Sigma,
} from "lucide-react";

import type { Indicator, LocationSummary } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { classificationStyle, formatCoord, formatDateTime, formatNumber, indicatorStatusLabel } from "@/lib/format";
import { ClassificationBadge, Chip, Panel, PanelHeader, Skeleton, StatusDot } from "@/components/ui/primitives";
import { ErrorState, UnavailableNotice } from "@/components/ui/states";
import type { SliceState } from "@/lib/workspace";

const INDICATOR_GROUPS: Record<string, { title: string; keys: string[] }> = {
  rainfall: {
    title: "Rainfall",
    keys: ["rainfall_anomaly", "wet_day_fraction", "forecast_7d_total"],
  },
  coverage: {
    title: "Evidence quality",
    keys: ["coverage", "data_freshness", "data_classification", "cross_check_delta"],
  },
  water: {
    title: "Water balance signals",
    keys: ["river_discharge_ratio"],
  },
};

function statusTone(status: string): "good" | "caution" | "alert" | "muted" {
  if (status === "ok") return "good";
  if (status === "stale" || status === "insufficient_data") return "caution";
  if (status === "unavailable") return "alert";
  return "muted";
}

function IndicatorRow({ indicator }: { indicator: Indicator }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const status = indicatorStatusLabel(indicator.status);
  const hasValue = indicator.value !== null && indicator.status === "ok";

  return (
    <div className="border-b border-white/[0.05] last:border-b-0">
      <div className="flex items-start gap-3 px-4 py-3">
        <StatusDot tone={statusTone(indicator.status)} label={status.label} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm font-medium text-ink-100">{indicator.label}</p>
            <p className="shrink-0 font-mono text-sm text-ink-100">
              {hasValue ? (
                <>
                  {formatNumber(indicator.value, indicator.unit === "ratio" ? 2 : 1)}
                  <span className="ml-1 text-xs text-ink-400">{indicator.unit}</span>
                </>
              ) : (
                <span className={cn("text-xs font-sans", status.className)}>
                  {status.label}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={panelId}
            className="mt-1 inline-flex items-center gap-1 text-[0.6875rem] font-medium text-ink-400 transition hover:text-water-300"
          >
            Method &amp; limitations
            <ChevronDown
              className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")}
              aria-hidden
            />
          </button>
        </div>
      </div>
      {expanded ? (
        <div id={panelId} className="space-y-2 bg-black/20 px-4 pb-3 pt-1 text-xs">
          <div>
            <p className="label-caps">Method</p>
            <p className="mt-0.5 leading-relaxed text-ink-300">
              {indicator.method}{" "}
              <span className="text-ink-500">v{indicator.method_version}</span>
            </p>
          </div>
          {indicator.inputs.length ? (
            <div>
              <p className="label-caps">Inputs</p>
              <ul className="mt-0.5 list-inside list-disc text-ink-300">
                {indicator.inputs.map((input) => (
                  <li key={input}>{input}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {indicator.limitations.length ? (
            <div>
              <p className="label-caps">Limitations</p>
              <ul className="mt-0.5 space-y-0.5 text-ink-300">
                {indicator.limitations.map((limitation) => (
                  <li key={limitation} className="flex gap-1.5">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-signal-caution" aria-hidden />
                    <span>{limitation}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SummaryBody({
  summary,
  onRetry,
}: {
  summary: LocationSummary;
  onRetry: () => void;
}) {
  const [tab, setTab] = useState<"indicators" | "sources" | "notes">("indicators");
  const byKey = new Map(summary.indicators.map((i) => [i.key, i]));
  const unavailableCount = summary.indicators.filter((i) => i.status === "unavailable").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-water-300" aria-hidden />
          <p className="text-sm font-semibold text-ink-100">
            {summary.resolved_place?.name ?? summary.label ?? "Selected location"}
          </p>
        </div>
        <p className="mt-0.5 font-mono text-xs text-ink-400">
          {formatCoord(summary.location.latitude, "lat")} ·{" "}
          {formatCoord(summary.location.longitude, "lon")}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Chip title="Providers that returned usable data">
            <Database className="h-3 w-3" aria-hidden />
            {summary.providers.filter((p) => p.status === "ok").length}/
            {summary.providers.length} live
          </Chip>
          <Chip title="Time the summary was assembled">
            {formatDateTime(summary.generated_at)}
          </Chip>
        </div>
      </div>

      <div className="flex border-b border-white/[0.06] px-2 pt-1" role="tablist">
        {(
          [
            ["indicators", "Indicators"],
            ["sources", "Sources"],
            ["notes", "Notes"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "relative px-3 py-2 text-xs font-medium transition",
              tab === id ? "text-water-200" : "text-ink-400 hover:text-ink-200",
            )}
          >
            {label}
            {tab === id ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-water-300" />
            ) : null}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "indicators" ? (
          <div>
            {unavailableCount > 0 ? (
              <div className="px-4 pt-3">
                <UnavailableNotice
                  title={`${unavailableCount} indicator${unavailableCount === 1 ? "" : "s"} unavailable`}
                  message="Some datasets returned no usable data for this location. Those indicators are reported as unavailable rather than estimated."
                />
              </div>
            ) : null}
            {Object.entries(INDICATOR_GROUPS).map(([groupId, group]) => {
              const items = group.keys
                .map((key) => byKey.get(key))
                .filter((i): i is Indicator => Boolean(i));
              if (!items.length) return null;
              return (
                <div key={groupId}>
                  <p className="label-caps px-4 pb-1 pt-4">{group.title}</p>
                  {items.map((indicator) => (
                    <IndicatorRow key={indicator.key} indicator={indicator} />
                  ))}
                </div>
              );
            })}
            {summary.indicators
              .filter(
                (i) =>
                  !Object.values(INDICATOR_GROUPS).some((g) => g.keys.includes(i.key)),
              )
              .map((indicator) => (
                <IndicatorRow key={indicator.key} indicator={indicator} />
              ))}
          </div>
        ) : null}

        {tab === "sources" ? (
          <ul className="divide-y divide-white/[0.05]">
            {summary.providers.map((provider) => (
              <li key={provider.provider_id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-ink-100">
                    {provider.provider_name}
                  </p>
                  <StatusDot
                    tone={
                      provider.status === "ok"
                        ? "good"
                        : provider.status === "partial"
                          ? "caution"
                          : provider.status === "unconfigured"
                            ? "muted"
                            : "alert"
                    }
                    pulse={provider.status === "ok"}
                    label={provider.status}
                  />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      "text-[0.6875rem] font-medium uppercase tracking-wide",
                      provider.status === "ok"
                        ? "text-signal-good"
                        : provider.status === "partial"
                          ? "text-signal-caution"
                          : "text-ink-400",
                    )}
                  >
                    {provider.status}
                  </span>
                  {provider.classification ? (
                    <ClassificationBadge classification={provider.classification} compact />
                  ) : null}
                </div>
                {provider.message ? (
                  <p className="mt-1 text-xs leading-relaxed text-ink-400">
                    {provider.message}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {tab === "notes" ? (
          <div className="space-y-3 px-4 py-4">
            <div className="flex items-start gap-2 rounded-lg border border-water-400/20 bg-water-400/[0.05] p-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-water-300" aria-hidden />
              <p className="text-xs leading-relaxed text-ink-200">
                AquaNexus reports what the data supports and states what it does not.
                Every value carries its source and classification.
              </p>
            </div>
            {summary.notes.map((note) => (
              <p key={note} className="text-xs leading-relaxed text-ink-300">
                {note}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="border-t border-white/[0.06] px-4 py-2.5">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-400 transition hover:text-water-300"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          Refresh all sources
        </button>
      </div>
    </div>
  );
}

export function IntelligencePanel({
  slice,
  onRetry,
}: {
  slice: SliceState<LocationSummary>;
  onRetry: () => void;
}) {
  return (
    <Panel as="aside" className="flex h-full min-h-0 flex-col overflow-hidden">
      <PanelHeader
        title="Location intelligence"
        subtitle="Indicators, sources and methods"
        icon={<Gauge className="h-4 w-4" aria-hidden />}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        {slice.loading && !slice.data ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <div className="space-y-2 pt-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </div>
        ) : null}

        {!slice.loading && slice.error ? (
          <ErrorState
            title="Could not build a summary"
            message={slice.error}
            onRetry={onRetry}
          />
        ) : null}

        {slice.data ? <SummaryBody summary={slice.data} onRetry={onRetry} /> : null}
      </div>
    </Panel>
  );
}
