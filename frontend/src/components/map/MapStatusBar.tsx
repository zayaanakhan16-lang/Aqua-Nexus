"use client";

/**
 * Compact status bar pinned to the bottom of the map workspace.
 *
 * It reports genuine map and data status only — the active basemap, whether the
 * imagery view is on, how many investigations are saved and what is selected.
 * No invented progress or activity.
 */
import { Database, Globe2, Satellite } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCoord } from "@/lib/format";
import type { SelectedLocation } from "@/lib/workspace";

export function MapStatusBar({
  count,
  basemapLabel,
  imageryLabel,
  selected,
  className,
}: {
  count: number;
  basemapLabel: string;
  imageryLabel: string;
  selected: SelectedLocation | null;
  className?: string;
}) {
  return (
    <div className={cn("chrome flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-2.5", className)}>
      <span className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-water-300" aria-hidden />
        <span className="text-2xs font-medium text-ink-100">AquaNexus online</span>
      </span>

      <span className="hidden h-4 w-px bg-white/10 sm:block" aria-hidden />

      <span className="flex items-center gap-1.5">
        <Globe2 className="h-3 w-3 text-water-300" aria-hidden />
        <span className="text-2xs text-ink-400">Basemap</span>
        <span className="text-2xs font-medium text-ink-100">{basemapLabel}</span>
      </span>

      <span className="hidden h-4 w-px bg-white/10 sm:block" aria-hidden />

      <span className="flex items-center gap-1.5">
        <Satellite className="h-3 w-3 text-water-300" aria-hidden />
        <span className="text-2xs text-ink-400">Imagery</span>
        <span className="text-2xs font-medium text-ink-100">{imageryLabel}</span>
      </span>

      <span className="hidden h-4 w-px bg-white/10 md:block" aria-hidden />

      <span className="hidden items-center gap-1.5 md:flex">
        <Database className="h-3 w-3 text-water-300" aria-hidden />
        <span className="text-2xs text-ink-400">Investigations</span>
        <span className="font-mono text-2xs tabular-nums text-ink-100">{count}</span>
      </span>

      {selected ? (
        <>
          <span className="hidden h-4 w-px bg-white/10 lg:block" aria-hidden />
          <span className="flex items-center gap-1.5">
            <span className="text-2xs text-ink-400">Selected</span>
            <span className="max-w-[10rem] truncate text-2xs font-medium text-ink-100">
              {selected.place?.name ?? selected.label}
            </span>
            <span className="hidden font-mono text-2xs tabular-nums text-ink-400 xl:inline">
              {formatCoord(selected.latitude, "lat")} · {formatCoord(selected.longitude, "lon")}
            </span>
          </span>
        </>
      ) : null}
    </div>
  );
}
