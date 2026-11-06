"use client";

/**
 * Explore Map — the single, primary AquaNexus water-intelligence workspace.
 *
 * One selected location drives everything: search and the map set it, and the
 * intelligence surface reports every category the connected providers support
 * for it. The layout follows the AgriSense pattern: the map takes the remaining
 * width with the investigation rail in a fixed-width column on the right, a
 * vertical toolbar on the left edge and a Map / Analytics control at the top
 * centre. The results surface lives in `components/workspace/IntelligenceTabs`.
 *
 * Selecting a new location clears the previous results while the new ones load
 * (see the workspace store), so stale evidence is never shown against a new
 * place.
 */
import { Compass, MapPin } from "lucide-react";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import { formatCoord } from "@/lib/format";
import { useStudyAreas } from "@/lib/study-areas";
import { WorkspaceProvider, useWorkspace, type SelectedLocation } from "@/lib/workspace";
import { Chip } from "@/components/ui/primitives";
import { LocationSearch } from "@/components/panels/LocationSearch";
import { OnboardingCard } from "@/components/panels/OnboardingCard";
import { CreateStudyAreaDialog } from "@/components/study-areas/CreateStudyAreaDialog";
import { IntelligenceTabs, type WorkspaceTabId } from "@/components/workspace/IntelligenceTabs";
import { InvestigationList } from "@/components/workspace/InvestigationList";
import { MapWorkspace } from "@/components/workspace/MapWorkspace";
import { MapAnalyticsToggle, type WorkspaceMode } from "@/components/map/MapAnalyticsToggle";
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
  "profile",
  "planning",
  "ai",
  "report",
  "sources",
];

/**
 * Search is a compact strip above the map rather than a second column, so the
 * document stays within the viewport and the map keeps the width it needs.
 */
function SearchBar({ onAdd }: { onAdd: () => void }) {
  const { location, windowDays } = useWorkspace();

  return (
    <div className="chrome flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
      <span className="flex shrink-0 items-center gap-1.5">
        <Compass className="h-3.5 w-3.5 text-water-300" aria-hidden />
        <span className="label-caps">Find a location</span>
      </span>

      <div className="min-w-[14rem] flex-1">
        <LocationSearch />
      </div>

      {location ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-water-300" aria-hidden />
            <span className="truncate text-xs font-medium text-ink-100">
              {location.place?.name ?? location.label}
            </span>
            <span className="hidden font-mono text-2xs tabular-nums text-ink-400 xl:inline">
              {formatCoord(location.latitude, "lat")} · {formatCoord(location.longitude, "lon")}
            </span>
          </span>
          <Chip title="Analysis window used by every section">Window {windowDays} d</Chip>
          <button
            type="button"
            onClick={onAdd}
            className="shrink-0 rounded-lg border border-water-300/35 bg-water-300/12 px-2.5 py-1.5 text-2xs font-medium text-water-200 transition hover:bg-water-300/20"
          >
            New investigation
          </button>
        </div>
      ) : (
        <Chip title="Search also accepts direct coordinates">
          Try typing <span className="font-mono">52.52, 13.40</span>
        </Chip>
      )}
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
  const { areas } = useStudyAreas();
  const [mode, setMode] = useState<WorkspaceMode>("map");
  const [dialogOpen, setDialogOpen] = useState(false);

  const rail = <InvestigationList onAdd={() => setDialogOpen(true)} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      {/* Visually hidden page heading: the workspace is a full-bleed map with no
          visible title, but screen-reader users still need an h1 to orient. */}
      <h1 className="sr-only">Explore Map</h1>

      <SearchBar onAdd={() => setDialogOpen(true)} />

      <div className="relative flex min-h-0 flex-1 flex-col gap-3 lg:overflow-hidden">
        {/* The single Map / Analytics control for this surface. One element,
            repositioned by breakpoint: in flow above the map on small screens,
            floating at the top centre of the workspace from lg up. Rendering it
            once keeps exactly one tablist in the DOM. */}
        <div className="pointer-events-none relative z-30 flex shrink-0 justify-center lg:absolute lg:inset-x-0 lg:top-3">
          <MapAnalyticsToggle
            mode={mode}
            onChange={setMode}
            className="pointer-events-auto"
          />
        </div>

        {mode === "map" ? (
          <MapWorkspace
            rail={rail}
            railCount={areas.length}
            className="min-h-[32rem] rounded-xl border border-white/[0.08] bg-abyss-950 lg:min-h-0"
            overlay={
              !location ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-16 z-10 flex justify-center px-4">
                  <div className="chrome max-w-sm px-3 py-2 text-center">
                    <p className="text-2xs text-ink-300">
                      Click the map to place an analysis point, or search above.
                    </p>
                  </div>
                </div>
              ) : null
            }
          >
            <MapPanel className="absolute inset-0" showHint={false} />
          </MapWorkspace>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!location ? <OnboardingCard /> : null}
            {/* The results surface is always mounted: Global Layers and Sources
                stay usable before a location is chosen, and every other section
                shows an explicit "select a location" state rather than
                disappearing. */}
            <IntelligenceTabs
              initialTab={initialTab ?? (location ? "overview" : "global-layers")}
              tabRequest={tabRequest}
              className="min-h-[36rem]"
            />
          </div>
        )}
      </div>

      {location ? (
        <CreateStudyAreaDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          latitude={location.latitude}
          longitude={location.longitude}
          label={location.label}
          place={location.place}
          areaKm2={location.area?.area_km2 ?? null}
        />
      ) : null}
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
