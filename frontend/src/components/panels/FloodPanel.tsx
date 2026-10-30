"use client";

/**
 * Flood intelligence panel — evidence-based screening.
 *
 * Renders the backend's flood-evidence module: observed water extent, rainfall
 * accumulation signals and modelled discharge signals, each labelled with its
 * own evidence type, classification, period, source and limitations.
 *
 * The panel is emphatic that this is screening, not an official warning, and it
 * never converts a rainfall signal into a flood statement.
 */
import { AlertTriangle, CloudRain, Droplets, Info, ShieldAlert, Waves } from "lucide-react";

import {
  ClassificationBadge,
  Chip,
  Panel,
  PanelHeader,
  Skeleton,
  StatusDot,
} from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { DischargeChart } from "@/components/charts/DischargeChart";
import { evidenceItemLabel, evidenceItemTone, floodStatus } from "@/lib/water-intel";
import type { SliceState } from "@/lib/workspace";
import type { FloodEvidenceItem, FloodEvidenceResult } from "@/lib/schemas";

const TYPE_META: Record<string, { label: string; icon: typeof Waves }> = {
  observed_water: { label: "Observed water extent", icon: Waves },
  rainfall_signal: { label: "Rainfall signal", icon: CloudRain },
  discharge_signal: { label: "Modelled discharge", icon: Droplets },
};

function ItemRow({ item }: { item: FloodEvidenceItem }) {
  const meta = TYPE_META[item.evidence_type] ?? { label: item.evidence_type, icon: Waves };
  const Icon = meta.icon;
  const tone = evidenceItemTone(item.status);
  return (
    <li className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-water-300">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-ink-100">{item.label}</p>
            <ClassificationBadge classification={item.classification} compact />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusDot tone={tone} label={item.status} />
            <span className="text-xs font-semibold text-ink-200">
              {item.value !== null && item.value !== undefined
                ? `${item.value}${item.unit ? ` ${item.unit}` : ""}`
                : evidenceItemLabel(item.status)}
            </span>
            <span className="text-[0.6875rem] uppercase tracking-wide text-ink-500">
              {meta.label}
            </span>
          </div>
          {item.period ? (
            <p className="mt-1 text-[0.6875rem] text-ink-500">Window: {item.period}</p>
          ) : null}
          {item.method ? (
            <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-ink-400">{item.method}</p>
          ) : null}
          <p className="mt-1 text-[0.6875rem] text-ink-500">Source: {item.source}</p>
          {item.limitations.length ? (
            <ul className="mt-2 space-y-1">
              {item.limitations.map((limitation) => (
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
        </div>
      </div>
    </li>
  );
}

export function FloodPanel({
  slice,
  onRetry,
}: {
  slice: SliceState<FloodEvidenceResult>;
  onRetry: () => void;
}) {
  const data = slice.data;
  const status = data ? floodStatus(data.status) : null;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Flood intelligence"
        subtitle="Evidence-based screening — not an official flood warning"
        icon={<ShieldAlert className="h-4 w-4" aria-hidden />}
      />
      <div className="space-y-4 p-4">
        <div className="flex items-start gap-2 rounded-lg border border-signal-caution/25 bg-signal-caution/[0.06] px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-signal-caution" aria-hidden />
          <p className="text-xs leading-relaxed text-ink-200">
            {data?.disclaimer ??
              "AquaNexus does not operate a validated flood forecast model. It reports observed and rainfall-related evidence for investigation, never a flood probability."}
          </p>
        </div>

        {slice.loading && !data ? <Skeleton className="h-56 w-full" /> : null}
        {!slice.loading && slice.error ? (
          <ErrorState
            title="Flood-evidence sources unavailable"
            message={slice.error}
            onRetry={onRetry}
          />
        ) : null}

        {data && status ? (
          <>
            <div
              className={
                "flex items-start gap-3 rounded-lg border px-3 py-3 " +
                (status.tone === "alert"
                  ? "border-signal-alert/30 bg-signal-alert/[0.07]"
                  : status.tone === "caution"
                    ? "border-signal-caution/25 bg-signal-caution/[0.06]"
                    : status.tone === "good"
                      ? "border-signal-good/25 bg-signal-good/[0.06]"
                      : "border-white/[0.08] bg-white/[0.02]")
              }
            >
              <StatusDot tone={status.tone} label={status.label} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-100">{data.headline}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-300">{data.detail}</p>
                <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-500">
                  {status.meaning}
                </p>
              </div>
            </div>

            {data.discharge ? (
              <div className="rounded-lg border border-white/[0.06] bg-abyss-950/40 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
                  <p className="text-xs font-semibold text-ink-200">
                    GloFAS modelled discharge — reanalysis vs. forecast
                  </p>
                  <span className="text-[0.6875rem] text-ink-500">
                    {data.discharge.model ?? "GloFAS"} · ~{data.discharge.grid_resolution_km} km
                    grid cell
                  </span>
                </div>
                <DischargeChart series={data.discharge} height={240} />
                <p className="px-1 pt-1 text-[0.6875rem] leading-relaxed text-ink-500">
                  {data.discharge.note} Provider grid cell{" "}
                  {data.discharge.grid_cell
                    ? `${data.discharge.grid_cell.latitude.toFixed(3)}, ${data.discharge.grid_cell.longitude.toFixed(3)}`
                    : "unreported"}
                  . {data.discharge.historical_days} reanalysis day(s) and{" "}
                  {data.discharge.forecast_days} forecast day(s). Source:{" "}
                  {data.discharge.provider.name}. A high discharge is a hydrological signal, not
                  confirmed flooding.
                </p>
              </div>
            ) : null}

            {data.items.length ? (
              <ul className="space-y-2">
                {data.items.map((item) => (
                  <ItemRow key={item.key} item={item} />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<Waves className="h-5 w-5" aria-hidden />}
                title="No flood-relevant evidence returned"
                description="No observed-water, rainfall or discharge source returned usable data for this location and window."
              />
            )}

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
