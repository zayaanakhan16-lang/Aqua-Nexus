"use client";

/**
 * Satellite Explorer tab panel.
 *
 * Lists real Copernicus STAC search results for the location: scene id,
 * collection, acquisition date, cloud cover and a link to the source record.
 * These are catalogue metadata, not processed imagery — the panel states that
 * plainly and does not claim any water-body detection.
 */
import { ExternalLink, Satellite } from "lucide-react";

import { ClassificationBadge, Chip, Panel, PanelHeader, Skeleton } from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { formatDate, formatNumber } from "@/lib/format";
import type { SliceState } from "@/lib/workspace";
import type { StacSearchResult } from "@/lib/schemas";

export function SatellitePanel({
  slice,
  onRetry,
}: {
  slice: SliceState<StacSearchResult>;
  onRetry: () => void;
}) {
  const data = slice.data;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Satellite explorer"
        subtitle="Copernicus STAC scene metadata (not processed imagery)"
        icon={<Satellite className="h-4 w-4" aria-hidden />}
        actions={
          data ? <ClassificationBadge classification={data.provider.classification ?? "satellite_estimate"} /> : null
        }
      />
      <div className="space-y-3 p-4">
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
                  <li key={item.id} className="flex items-start gap-3 px-3 py-2.5">
                    <Satellite className="mt-0.5 h-4 w-4 shrink-0 text-water-300" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs text-ink-100">{item.id}</p>
                      <p className="mt-0.5 text-[0.6875rem] text-ink-400">
                        {item.collection}
                        {item.acquired_at ? ` · ${formatDate(item.acquired_at)}` : ""}
                        {item.cloud_cover !== null && item.cloud_cover !== undefined
                          ? ` · ${formatNumber(item.cloud_cover, 0)}% cloud`
                          : ""}
                      </p>
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
                ))}
              </ul>
            )}

            <p className="text-[0.6875rem] leading-relaxed text-ink-500">{data.note}</p>
          </>
        ) : null}
      </div>
    </Panel>
  );
}
