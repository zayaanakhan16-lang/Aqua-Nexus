"use client";

/**
 * Explore Map — focused, map-first location discovery.
 *
 * The map is the working surface. Search and the selected-location summary sit
 * in a compact rail beside it, and the primary action turns the current
 * selection into a persisted study area. This is the entry point to the
 * location-to-investigation flow.
 */
import dynamic from "next/dynamic";
import { useState } from "react";
import { Compass, Globe2, Layers, MapPin } from "lucide-react";

import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { formatCoord } from "@/lib/format";
import { LocationSearch } from "@/components/panels/LocationSearch";
import { LayerControls } from "@/components/panels/LayerControls";
import { CreateStudyAreaDialog } from "@/components/study-areas/CreateStudyAreaDialog";
import { Chip } from "@/components/ui/primitives";

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

function SelectionSummary() {
  const { location } = useWorkspace();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="panel space-y-3 p-3">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-water-300" aria-hidden />
        <p className="label-caps">Selected location</p>
      </div>

      {location ? (
        <>
          <div className="rounded-lg border border-water-400/25 bg-water-400/[0.07] px-3 py-2.5">
            <p className="truncate text-sm font-medium text-ink-100">
              {location.place?.name ?? location.label}
            </p>
            <p className="mt-0.5 font-mono text-xs text-ink-400">
              {formatCoord(location.latitude, "lat")} · {formatCoord(location.longitude, "lon")}
            </p>
            {location.place?.display_name && location.place.display_name !== location.place.name ? (
              <p className="mt-0.5 truncate text-xs text-ink-500">
                {location.place.display_name}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="w-full rounded-lg bg-water-400 px-4 py-2.5 text-sm font-semibold text-abyss-950 transition hover:bg-water-300"
          >
            Create study area
          </button>
        </>
      ) : (
        <p className="text-xs leading-relaxed text-ink-400">
          Search for a place or click anywhere on the map to set an analysis point. Then save it
          as a study area to open its intelligence workspace.
        </p>
      )}

      {location ? (
        <CreateStudyAreaDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          latitude={location.latitude}
          longitude={location.longitude}
          label={location.label}
          place={location.place}
        />
      ) : null}
    </div>
  );
}

function ExploreWorkspace() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        <div className="panel space-y-3 p-3">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-water-300" aria-hidden />
            <p className="label-caps">Find a location</p>
          </div>
          <LocationSearch />
          <Chip title="Search also accepts direct coordinates">
            Try typing <span className="font-mono">52.52, 13.40</span>
          </Chip>
        </div>
        <SelectionSummary />
        <LayerControls />
      </div>

      <div className="relative min-h-[56vh] overflow-hidden rounded-xl border border-white/[0.06] bg-abyss-900 shadow-panel lg:min-h-0">
        <WaterAtlasMap />
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border border-white/10 bg-abyss-900/85 px-2.5 py-1.5 backdrop-blur">
          <Layers className="h-3.5 w-3.5 text-water-300" aria-hidden />
          <span className="text-[0.6875rem] text-ink-300">Click the map to select</span>
        </div>
      </div>
    </div>
  );
}

export default function ExploreClient() {
  return (
    <WorkspaceProvider>
      <ExploreWorkspace />
    </WorkspaceProvider>
  );
}
