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
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import { formatCoord } from "@/lib/format";
import { WorkspaceProvider, useWorkspace, type SelectedLocation } from "@/lib/workspace";
import { Chip } from "@/components/ui/primitives";
import { LocationSearch } from "@/components/panels/LocationSearch";
import { LayerControls } from "@/components/panels/LayerControls";
import { OnboardingCard } from "@/components/panels/OnboardingCard";
import { CreateStudyAreaDialog } from "@/components/study-areas/CreateStudyAreaDialog";
import { IntelligenceTabs, type WorkspaceTabId } from "@/components/workspace/IntelligenceTabs";
import { MapPanel } from "@/components/workspace/MapPanel";

/** Tab ids that a deep link (`/explore?tab=…`) may address. */
const TAB_IDS: WorkspaceTabId[] = [
  "overview",
  "weather",
  "precipitation",
  "water-presence",
  "water-atlas",
  "water-stress",
  "flood",
  "outlook",
  "change",
  "discharge",
  "satellite",
  "global-layers",
  "ai",
  "report",
  "sources",
];

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
              <p className="mt-0.5 font-mono text-xs text-ink-300">
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

function ExploreWorkspace({
  initialTab,
  tabRequest,
}: {
  initialTab?: WorkspaceTabId;
  tabRequest?: WorkspaceTabId;
}) {
  const { location } = useWorkspace();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 lg:overflow-hidden">
      {/* Visually hidden page heading: the workspace is a full-bleed map with no
          visible title, but screen-reader users still need an h1 to orient. */}
      <h1 className="sr-only">Explore Map</h1>
      <div className="grid min-h-0 shrink-0 grid-cols-1 gap-3 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <SelectionRail />
        <MapPanel />
      </div>

      {!location ? <OnboardingCard /> : null}
      {/* The results surface is always mounted: Global Layers and Sources stay
          usable before a location is chosen, and every other tab shows an
          explicit "select a location" state rather than disappearing. */}
      <IntelligenceTabs
        initialTab={initialTab ?? (location ? "overview" : "global-layers")}
        tabRequest={tabRequest}
        className="min-h-0 shrink-0 lg:min-h-[32rem]"
      />
    </div>
  );
}

/**
 * Reads the URL so `/explore?lat=…&lon=…&tab=…` opens a working workspace on
 * arrival. This is what the navigation sections link to: each section points at
 * the relevant tab, so the sidebar is real navigation rather than a dead label.
 */
function ExploreWithParams() {
  // `useSearchParams` returns null outside a router context (e.g. a unit test
  // rendering the component directly), so every read is guarded.
  const searchParams = useSearchParams();

  const initialLocation = ((): SelectedLocation | null => {
    if (!searchParams) return null;
    const rawLat = searchParams.get("lat");
    const rawLon = searchParams.get("lon");
    if (rawLat === null || rawLon === null) return null;
    const lat = Number(rawLat);
    const lon = Number(rawLon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return {
      latitude: lat,
      longitude: lon,
      label: searchParams.get("label") ?? `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      mode: "point",
    };
  })();

  const requestedTab = searchParams?.get("tab") ?? null;
  const initialTab =
    requestedTab && (TAB_IDS as string[]).includes(requestedTab)
      ? (requestedTab as WorkspaceTabId)
      : undefined;

  return (
    <WorkspaceProvider initialLocation={initialLocation}>
      <ExploreWorkspace initialTab={initialTab} tabRequest={initialTab} />
    </WorkspaceProvider>
  );
}

export default function ExploreClient() {
  return (
    // useSearchParams needs a Suspense boundary so the route can still be
    // statically prerendered.
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <ExploreWithParams />
    </Suspense>
  );
}
