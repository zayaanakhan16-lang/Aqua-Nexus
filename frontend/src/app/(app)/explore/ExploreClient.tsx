"use client";

/**
 * Explore Map — the single, primary AquaNexus water-intelligence workspace.
 *
 * One selected location drives everything: the search rail sets it, the map
 * renders it, and the intelligence tabs report every category the connected
 * providers support for it. The full tabbed results surface (previously split
 * across the legacy Atlas route and the study-area workspace) now lives here, so there
 * is one workspace rather than several competing entry points.
 *
 * Selecting a new location clears the previous results while the new ones load
 * (see the workspace store), so stale evidence is never shown against a new
 * place.
 */
import { Compass, MapPin } from "lucide-react";
import { useState } from "react";

import { formatCoord } from "@/lib/format";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { Chip } from "@/components/ui/primitives";
import { LocationSearch } from "@/components/panels/LocationSearch";
import { LayerControls } from "@/components/panels/LayerControls";
import { OnboardingCard } from "@/components/panels/OnboardingCard";
import { CreateStudyAreaDialog } from "@/components/study-areas/CreateStudyAreaDialog";
import { IntelligenceTabs } from "@/components/workspace/IntelligenceTabs";
import { MapPanel } from "@/components/workspace/MapPanel";

function SelectionRail() {
  const { location, windowDays } = useWorkspace();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto">
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
              {location.place?.display_name &&
              location.place.display_name !== location.place.name ? (
                <p className="mt-0.5 truncate text-xs text-ink-500">
                  {location.place.display_name}
                </p>
              ) : null}
              <p className="mt-1.5 text-[0.6875rem] text-ink-500">
                Analysis window: {windowDays} days
              </p>
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
            as a study area to keep it.
          </p>
        )}
      </div>

      <LayerControls />

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
  const { location } = useWorkspace();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 lg:overflow-hidden">
      <div className="grid min-h-0 shrink-0 grid-cols-1 gap-3 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <SelectionRail />
        <MapPanel />
      </div>

      {location ? (
        <IntelligenceTabs className="min-h-0 shrink-0 lg:min-h-[32rem]" />
      ) : (
        <OnboardingCard />
      )}
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
