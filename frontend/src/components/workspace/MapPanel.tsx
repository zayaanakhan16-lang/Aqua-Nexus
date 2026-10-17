"use client";

/**
 * Map panel — the interactive geospatial surface, shared by the workspaces.
 *
 * MapLibre is loaded client-side only (no SSR) and the container always fills
 * its parent. Loading and engine-unavailable states are handled by the map
 * component itself; this wrapper only provides the frame and the legend/hint
 * affordances that sit above it.
 */
import dynamic from "next/dynamic";
import { Globe2, MousePointerClick } from "lucide-react";

const WaterAtlasMap = dynamic(
  () => import("@/components/map/WaterAtlasMap").then((m) => m.WaterAtlasMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-abyss-950">
        <div className="flex items-center gap-2 text-xs text-ink-400">
          <Globe2 className="h-4 w-4 animate-pulse text-water-300" aria-hidden />
          Loading map…
        </div>
      </div>
    ),
  },
);

export function MapPanel({
  className,
  showHint = true,
}: {
  className?: string;
  showHint?: boolean;
}) {
  return (
    <div
      className={
        className ??
        "relative min-h-[46vh] overflow-hidden rounded-xl border border-white/[0.06] bg-abyss-900 shadow-panel lg:min-h-[42vh]"
      }
    >
      <WaterAtlasMap />
      {showHint ? (
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border border-white/10 bg-abyss-900/85 px-2.5 py-1.5 backdrop-blur">
          <MousePointerClick className="h-3.5 w-3.5 text-water-300" aria-hidden />
          <span className="text-[0.6875rem] text-ink-300">Click the map to select a point</span>
        </div>
      ) : null}
    </div>
  );
}
