"use client";

/**
 * Water Atlas panel — lakes, rivers and other mapped water bodies.
 *
 * Lists the mapped features the backend discovered around the selected point,
 * with their real geometry metadata (kind, area, distance) and a "focus on map"
 * action that recentres the map on the feature. Names and boundaries come from
 * OpenStreetMap contributor mapping, and the panel says so — it never invents a
 * feature name or measurement.
 */
import { Droplets, ExternalLink, Layers, MapPin, Waves } from "lucide-react";

import { Chip, Panel, PanelHeader, Skeleton, StatusDot } from "@/components/ui/primitives";
import { EmptyState, ErrorState, UnavailableNotice } from "@/components/ui/states";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useWorkspace, type SliceState } from "@/lib/workspace";
import type { WaterBody, WaterBodyResult } from "@/lib/schemas";

const KIND_META: Record<string, { label: string; icon: typeof Layers }> = {
  lake: { label: "Lake", icon: Layers },
  reservoir: { label: "Reservoir", icon: Waves },
  river: { label: "River", icon: Waves },
  riverbank: { label: "Riverbank", icon: Waves },
  wetland: { label: "Wetland", icon: Droplets },
  water: { label: "Water body", icon: Droplets },
};

function kindMeta(kind: string) {
  return KIND_META[kind] ?? { label: kind, icon: Droplets };
}

function BodyRow({ body }: { body: WaterBody }) {
  const { selectLocation } = useWorkspace();
  const meta = kindMeta(body.kind);
  const Icon = meta.icon;
  const center = [
    (body.bbox.west + body.bbox.east) / 2,
    (body.bbox.south + body.bbox.north) / 2,
  ] as const;
  const osmHref =
    body.tags["osm_id"] && body.tags["osm_type"]
      ? `https://www.openstreetmap.org/${body.tags["osm_type"]}/${body.tags["osm_id"]}`
      : null;

  return (
    <li className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-water-400/20 bg-water-400/[0.07] text-water-300">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="truncate text-sm font-medium text-ink-100">
              {body.name ?? `Unnamed ${meta.label.toLowerCase()}`}
            </p>
            <span className="shrink-0 text-[0.6875rem] uppercase tracking-wide text-ink-500">
              {meta.label}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {body.area_km2 ? <Chip>{formatNumber(body.area_km2, 2)} km²</Chip> : null}
            <Chip title="Feature centroid">Focus on map</Chip>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() =>
                selectLocation({
                  latitude: center[1],
                  longitude: center[0],
                  label: body.name ?? `Mapped ${meta.label.toLowerCase()}`,
                })
              }
              className="inline-flex items-center gap-1.5 text-[0.6875rem] font-medium text-water-300 transition hover:text-water-200"
            >
              <MapPin className="h-3 w-3" aria-hidden />
              Analyse this feature
            </button>
            {osmHref ? (
              <a
                href={osmHref}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-[0.6875rem] font-medium text-ink-400 transition hover:text-ink-200"
              >
                <ExternalLink className="h-3 w-3" aria-hidden />
                OpenStreetMap
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

export function WaterAtlasPanel({
  slice,
  onRetry,
}: {
  slice: SliceState<WaterBodyResult>;
  onRetry: () => void;
}) {
  const data = slice.data;
  const byKind = new Map<string, number>();
  for (const body of data?.bodies ?? []) {
    byKind.set(body.kind, (byKind.get(body.kind) ?? 0) + 1);
  }
  const radiusKm = data ? Math.round(data.radius_m / 1000) : null;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Water atlas"
        subtitle={
          radiusKm
            ? `Mapped lakes, rivers and reservoirs within ${radiusKm} km`
            : "Mapped lakes, rivers and reservoirs nearby"
        }
        icon={<Layers className="h-4 w-4" aria-hidden />}
      />
      <div className="space-y-4 p-4">
        {slice.loading && !data ? <Skeleton className="h-56 w-full" /> : null}
        {!slice.loading && slice.error ? (
          <ErrorState
            title="Water-body mapping unavailable"
            message={slice.error}
            onRetry={onRetry}
          />
        ) : null}

        {data ? (
          <>
            {!data.service_reachable ? (
              <UnavailableNotice
                title="Mapping service did not answer"
                message="The OpenStreetMap lookup could not be completed for this request. This is a coverage failure, not evidence that no water bodies exist here."
              />
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Chip>
                <Droplets className="h-3 w-3" aria-hidden />
                {data.count} feature{data.count === 1 ? "" : "s"} found
              </Chip>
              {[...byKind.entries()].map(([kind, count]) => (
                <Chip key={kind}>
                  {kindMeta(kind).label}: {count}
                </Chip>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <StatusDot
                  tone={data.provider.status === "ok" ? "good" : "caution"}
                  label={data.provider.status}
                />
                <span className="text-[0.6875rem] text-ink-400">{data.provider.provider_name}</span>
              </span>
            </div>

            {data.bodies.length ? (
              <ul className="space-y-2">
                {data.bodies.map((body) => (
                  <BodyRow key={body.id} body={body} />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<Waves className="h-5 w-5" aria-hidden />}
                title="No mapped water features in this radius"
                description={
                  data.service_reachable
                    ? "The mapping service answered but returned no lakes, rivers or reservoirs within the search radius. Contributors may not have mapped smaller features here."
                    : "The lookup could not be completed, so no features could be listed."
                }
              />
            )}

            <p className={cn("text-[0.6875rem] leading-relaxed text-ink-500")}>{data.note}</p>
          </>
        ) : null}
      </div>
    </Panel>
  );
}
