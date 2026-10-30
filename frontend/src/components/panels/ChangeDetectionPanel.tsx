"use client";

/**
 * Environmental change detection panel.
 *
 * Presents the two satellite scenes the backend selected for before/after
 * comparison, side by side, with their acquisition dates, cloud cover and
 * resolution. It is explicit about the limits of the comparison: AquaNexus
 * discovers and pairs scenes but does not classify imagery pixels in this build,
 * so no water-area change value is invented.
 */
import { useState } from "react";
import { ArrowLeftRight, CalendarRange, Cloud, Info, Satellite } from "lucide-react";

import { Chip, Panel, PanelHeader, Skeleton } from "@/components/ui/primitives";
import { EmptyState, ErrorState, UnavailableNotice } from "@/components/ui/states";
import { formatDate, formatNumber } from "@/lib/format";
import type { SliceState } from "@/lib/workspace";
import type { ChangeDetectionResult, ChangeScene } from "@/lib/schemas";

function SceneCard({ scene, label }: { scene: ChangeScene; label: string }) {
  // A catalogue preview URL can expire. Degrade to the "no preview" state
  // instead of showing a broken image, so the comparison never implies an
  // observation that could not be retrieved.
  const [failed, setFailed] = useState(false);
  return (
    <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.015]">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-water-200">
          {label}
        </span>
        {scene.acquired_at ? (
          <span className="text-[0.6875rem] text-ink-400">{formatDate(scene.acquired_at)}</span>
        ) : null}
      </div>
      <div className="relative aspect-square w-full bg-abyss-950">
        {scene.thumbnail && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={scene.thumbnail}
            alt={`Satellite preview for ${scene.scene_id}`}
            loading="lazy"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-600">
            <Satellite className="h-6 w-6" aria-hidden />
            <span className="text-[0.625rem]">No rendered preview</span>
          </div>
        )}
      </div>
      <div className="space-y-1.5 px-3 py-2.5">
        <p className="truncate font-mono text-[0.6875rem] text-ink-300" title={scene.scene_id}>
          {scene.scene_id}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Chip>{scene.collection}</Chip>
          <Chip>{scene.resolution}</Chip>
          {scene.cloud_cover !== null && scene.cloud_cover !== undefined ? (
            <Chip>
              <Cloud className="h-3 w-3" aria-hidden />
              {formatNumber(scene.cloud_cover, 0)}%
            </Chip>
          ) : null}
          {scene.platform ? <Chip>{scene.platform}</Chip> : null}
        </div>
      </div>
    </div>
  );
}

export function ChangeDetectionPanel({
  slice,
  onRetry,
}: {
  slice: SliceState<ChangeDetectionResult>;
  onRetry: () => void;
}) {
  const data = slice.data;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Environmental change"
        subtitle="Before/after scene discovery for this area"
        icon={<CalendarRange className="h-4 w-4" aria-hidden />}
      />
      <div className="space-y-4 p-4">
        {slice.loading && !data ? <Skeleton className="h-64 w-full" /> : null}
        {!slice.loading && slice.error ? (
          <ErrorState
            title="Change-detection catalogue unavailable"
            message={slice.error}
            onRetry={onRetry}
          />
        ) : null}

        {data ? (
          <>
            {data.earlier && data.later ? (
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                <SceneCard scene={data.earlier} label="Earlier" />
                <span className="flex shrink-0 items-center justify-center text-ink-500 sm:px-1">
                  <ArrowLeftRight className="h-4 w-4" aria-hidden />
                </span>
                <SceneCard scene={data.later} label="Later" />
              </div>
            ) : (
              <EmptyState
                icon={<Satellite className="h-5 w-5" aria-hidden />}
                title="No comparable scenes found"
                description="AquaNexus could not find two usable scenes for this area and period."
              />
            )}

            <div
              className={
                "flex items-start gap-2 rounded-lg border px-3 py-2.5 " +
                (data.comparable
                  ? "border-signal-good/25 bg-signal-good/[0.06]"
                  : "border-signal-caution/25 bg-signal-caution/[0.06]")
              }
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-signal-caution" aria-hidden />
              <p className="text-xs leading-relaxed text-ink-200">{data.comparability_note}</p>
            </div>

            {data.scenes.length > 2 ? (
              <div>
                <p className="label-caps mb-2">All discovered scenes ({data.scenes.length})</p>
                <ul className="space-y-1">
                  {data.scenes.map((scene) => (
                    <li
                      key={scene.scene_id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/[0.05] bg-white/[0.01] px-2.5 py-1.5"
                    >
                      <span className="truncate font-mono text-[0.6875rem] text-ink-300">
                        {scene.scene_id}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-[0.6875rem] text-ink-500">
                        {scene.acquired_at ? <span>{formatDate(scene.acquired_at)}</span> : null}
                        {scene.cloud_cover !== null && scene.cloud_cover !== undefined ? (
                          <span>{formatNumber(scene.cloud_cover, 0)}% cloud</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {data.indicators.length ? (
              <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.015] px-3 py-2.5">
                <p className="text-xs font-semibold text-ink-200">
                  Indicators a full classification would require
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {data.indicators.map((indicator) => (
                    <Chip key={indicator}>{indicator}</Chip>
                  ))}
                </div>
                <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-500">
                  AquaNexus does not compute these in this build. No change value is reported.
                </p>
              </div>
            ) : null}

            {data.limitations.length ? (
              <UnavailableNotice
                title="Comparison limitations"
                message={data.limitations.join(" ")}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </Panel>
  );
}
