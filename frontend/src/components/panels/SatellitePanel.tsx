"use client";

/**
 * Satellite Explorer tab panel.
 *
 * Shows two clearly separated, real catalogues for the location:
 *
 * 1. Copernicus Sentinel-2 scene metadata (native 10 m), with the catalogue's
 *    own rendered preview.
 * 2. NASA HLS (Harmonized Landsat Sentinel-2) granule metadata from CMR STAC,
 *    labelled by source (Sentinel-2 or Landsat) and flagged as harmonized 30 m.
 *
 * Both are catalogue records, not an AquaNexus surface-water classification —
 * the panel states that plainly and never claims water-body detection.
 */
import { ExternalLink, ImageOff, Satellite } from "lucide-react";

import { ClassificationBadge, Chip, Panel, PanelHeader, Skeleton } from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { formatDate, formatNumber } from "@/lib/format";
import type { SliceState } from "@/lib/workspace";
import type { HLSItem, HLSSearchResult, StacItem, StacSearchResult } from "@/lib/schemas";

function SceneRow({ item }: { item: StacItem }) {
  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      {item.thumbnail ? (
        <a
          href={item.thumbnail}
          target="_blank"
          rel="noreferrer noopener"
          className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-white/10 bg-abyss-900"
          title="Open the full rendered scene preview"
        >
          {/* A plain <img> keeps the external catalogue URL out of the Next
              image optimizer, which would otherwise require remotePatterns and
              re-serve a third-party asset. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.thumbnail}
            alt={`Sentinel-2 rendered preview for scene ${item.id}`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </a>
      ) : (
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-white/10 bg-abyss-900 text-ink-600"
          title="This catalogue record has no rendered preview"
        >
          <ImageOff className="h-4 w-4" aria-hidden />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs text-ink-100">{item.id}</p>
        <p className="mt-0.5 text-[0.6875rem] text-ink-400">
          {item.collection}
          {item.acquired_at ? ` · ${formatDate(item.acquired_at)}` : ""}
          {item.cloud_cover !== null && item.cloud_cover !== undefined
            ? ` · ${formatNumber(item.cloud_cover, 0)}% cloud`
            : ""}
        </p>
        {item.cloud_cover !== null && item.cloud_cover !== undefined && item.cloud_cover > 90 ? (
          <p className="mt-0.5 text-[0.625rem] text-ink-500">
            Heavily clouded: surface detail is largely obscured.
          </p>
        ) : null}
      </div>
      {item.thumbnail ? (
        <a
          href={item.thumbnail}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex shrink-0 items-center gap-1 text-[0.6875rem] text-water-300 transition hover:text-water-200"
        >
          Record
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      ) : null}
    </li>
  );
}

/** One NASA HLS granule record. No rendered preview exists, so the row links to
 * the real CMR record instead of showing fabricated imagery. */
function HLSRow({ item }: { item: HLSItem }) {
  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <span
        className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-md border border-white/10 bg-abyss-900 px-1 text-center text-[0.5625rem] font-medium uppercase leading-tight tracking-wide text-water-200"
        title={`Harmonized HLS granule derived from ${item.data_source}`}
      >
        HLS
        <span className="mt-0.5 text-[0.5625rem] normal-case text-ink-400">
          {item.data_source.startsWith("Sentinel") ? "S30" : "L30"}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs text-ink-100">{item.id}</p>
        <p className="mt-0.5 text-[0.6875rem] text-ink-400">
          {item.data_source}
          {item.acquired_at ? ` · ${formatDate(item.acquired_at)}` : ""}
          {item.cloud_cover !== null && item.cloud_cover !== undefined
            ? ` · ${formatNumber(item.cloud_cover, 0)}% cloud`
            : ""}
        </p>
        <p className="mt-0.5 text-[0.625rem] text-ink-500">
          Harmonized 30 m grid — coarser than native 10 m Sentinel-2.
        </p>
      </div>
      {item.record_url ? (
        <a
          href={item.record_url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex shrink-0 items-center gap-1 text-[0.6875rem] text-water-300 transition hover:text-water-200"
        >
          Record
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      ) : null}
    </li>
  );
}

/** The NASA HLS catalogue section, rendered separately from Copernicus. */
function HLSSection({ slice, onRetry }: { slice: SliceState<HLSSearchResult>; onRetry: () => void }) {
  const data = slice.data;
  return (
    <div className="space-y-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center gap-2">
        <Satellite className="h-4 w-4 text-water-300" aria-hidden />
        <h3 className="text-sm font-medium text-ink-100">NASA HLS (Harmonized Landsat Sentinel-2)</h3>
      </div>
      <p className="text-[0.6875rem] leading-relaxed text-ink-500">
        NASA&apos;s harmonized 30 m product, discovered through the CMR STAC catalogue. Kept
        separate from the Copernicus Sentinel-2 list above so the two are not confused.
      </p>

      {slice.loading && !data ? <Skeleton className="h-24 w-full" /> : null}

      {!slice.loading && slice.error ? (
        <ErrorState title="NASA HLS catalogue unavailable" message={slice.error} onRetry={onRetry} />
      ) : null}

      {data ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Chip title="HLS collection searched">{data.collection}</Chip>
            <Chip title="Harmonized data source">{data.data_source}</Chip>
            <Chip title="Granules matched in the window">{data.count} granules</Chip>
          </div>

          {data.items.length === 0 ? (
            <EmptyState
              icon={<Satellite className="h-5 w-5" aria-hidden />}
              title="No HLS granules in this window"
              description="No harmonized acquisitions matched this extent and time window. HLS granules are published per overpass and are cloud-limited."
            />
          ) : (
            <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-lg border border-white/[0.06]">
              {data.items.map((item) => (
                <HLSRow key={item.id} item={item} />
              ))}
            </ul>
          )}

          <p className="text-[0.6875rem] leading-relaxed text-ink-500">{data.note}</p>
        </>
      ) : null}
    </div>
  );
}

export function SatellitePanel({
  slice,
  hls,
  onRetry,
}: {
  slice: SliceState<StacSearchResult>;
  hls: SliceState<HLSSearchResult>;
  onRetry: () => void;
}) {
  const data = slice.data;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Satellite explorer"
        subtitle="Real Copernicus and NASA catalogues (not processed imagery)"
        icon={<Satellite className="h-4 w-4" aria-hidden />}
        actions={
          data ? <ClassificationBadge classification={data.provider.classification ?? "satellite_estimate"} /> : null
        }
      />
      <div className="space-y-4 p-4">
        {slice.loading && !data ? <Skeleton className="h-40 w-full" /> : null}

        {!slice.loading && slice.error ? (
          <ErrorState title="Satellite catalogue unavailable" message={slice.error} onRetry={onRetry} />
        ) : null}

        {!slice.loading && !slice.error && !data ? (
          <EmptyState
            icon={<Satellite className="h-5 w-5" aria-hidden />}
            title="No satellite search yet"
            description="Satellite scene metadata is searched for each location automatically."
          />
        ) : null}

        {data ? (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-ink-100">Copernicus Sentinel-2 (native 10 m)</h3>
              <div className="flex flex-wrap items-center gap-2">
                <Chip title="Collection searched">{data.collection}</Chip>
                <Chip title="Scenes matched in the window">{data.count} scenes</Chip>
                <Chip title="Search window">
                  {formatDate(data.start)} → {formatDate(data.end)}
                </Chip>
              </div>

              {data.items.length === 0 ? (
                <EmptyState
                  icon={<Satellite className="h-5 w-5" aria-hidden />}
                  title="No scenes in this window"
                  description="No acquisitions matched this extent and time window. Optical coverage can be sparse over water and during overcast periods."
                />
              ) : (
                <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-lg border border-white/[0.06]">
                  {data.items.map((item) => (
                    <SceneRow key={item.id} item={item} />
                  ))}
                </ul>
              )}

              <p className="text-[0.6875rem] leading-relaxed text-ink-500">{data.note}</p>
            </div>

            <HLSSection slice={hls} onRetry={onRetry} />
          </>
        ) : null}
      </div>
    </Panel>
  );
}
