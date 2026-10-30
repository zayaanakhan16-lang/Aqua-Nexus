"use client";

/**
 * Local water intelligence panel.
 *
 * Reports whether surface water is observable in the selected area, using the
 * backend's observed/mapped water-presence module. It is deliberately explicit
 * that:
 *
 * - mapped features (OpenStreetMap) are contributor mapping, not a measurement;
 * - a satellite scene catalogue listing is not a water classification;
 * - "insufficient evidence" is never shown as "no water".
 *
 * Each observation carries its own source, classification, resolution, method
 * and limitations, taken straight from the backend.
 */
import { Droplets, Info, MapPin, Waves } from "lucide-react";

import {
  ClassificationBadge,
  Chip,
  Panel,
  PanelHeader,
  Skeleton,
  StatusDot,
} from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { formatDate } from "@/lib/format";
import { presenceStatus, type Tone } from "@/lib/water-intel";
import type { SliceState } from "@/lib/workspace";
import type { WaterPresenceObservation, WaterPresenceResult } from "@/lib/schemas";

function ObservationRow({ obs }: { obs: WaterPresenceObservation }) {
  const tone: Tone =
    obs.detected === true ? "good" : obs.detected === false ? "muted" : "caution";
  return (
    <li className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-3">
      <div className="flex items-start gap-3">
        <StatusDot tone={tone} label={obs.source_name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-ink-100">{obs.source_name}</p>
            <ClassificationBadge classification={obs.classification} compact />
          </div>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{obs.product}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-300">{obs.method}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip title="Native spatial resolution of this product">
              {obs.spatial_resolution}
            </Chip>
            {obs.observed_at ? <Chip>Observed {formatDate(obs.observed_at)}</Chip> : null}
            {obs.detected === true ? <Chip>Water indicated</Chip> : null}
            {obs.detected === false ? <Chip>No water indicated</Chip> : null}
            {obs.value !== null && obs.value !== undefined ? (
              <Chip>
                {obs.value}
                {obs.unit ? ` ${obs.unit}` : ""}
              </Chip>
            ) : null}
          </div>
          {obs.limitations.length ? (
            <ul className="mt-2 space-y-1">
              {obs.limitations.map((limitation) => (
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

export function WaterPresencePanel({
  slice,
  onRetry,
}: {
  slice: SliceState<WaterPresenceResult>;
  onRetry: () => void;
}) {
  const data = slice.data;
  const status = data ? presenceStatus(data.status) : null;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Water presence"
        subtitle="Observed and mapped surface water — not a flood statement"
        icon={<Droplets className="h-4 w-4" aria-hidden />}
      />
      <div className="space-y-4 p-4">
        {slice.loading && !data ? <Skeleton className="h-48 w-full" /> : null}
        {!slice.loading && slice.error ? (
          <ErrorState
            title="Water-presence sources unavailable"
            message={slice.error}
            onRetry={onRetry}
          />
        ) : null}

        {data && status ? (
          <>
            <div
              className={
                "flex items-start gap-3 rounded-lg border px-3 py-3 " +
                (status.tone === "good"
                  ? "border-signal-good/25 bg-signal-good/[0.06]"
                  : status.tone === "alert"
                    ? "border-signal-alert/25 bg-signal-alert/[0.06]"
                    : "border-signal-caution/25 bg-signal-caution/[0.06]")
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

            {data.observations.length ? (
              <ul className="space-y-2">
                {data.observations.map((obs) => (
                  <ObservationRow key={`${obs.source_id}-${obs.method}`} obs={obs} />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<MapPin className="h-5 w-5" aria-hidden />}
                title="No water-presence observation returned"
                description="No source returned a usable observation for this area. That is an absence of evidence, not evidence that water is absent."
              />
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
              <Chip
                title="An observation is 'conclusive' only when its source could return a water determination. Catalogue listings that only measure imagery availability are not conclusive."
              >
                <Waves className="h-3 w-3" aria-hidden />
                {data.evidence_count} conclusive of {data.observations.length} source observation
                {data.observations.length === 1 ? "" : "s"}
              </Chip>
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
