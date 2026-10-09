"use client";

/**
 * Water Atlas workspace shell.
 *
 * The map is the working surface. The left rail carries search, layers and
 * sources; the right rail carries location intelligence and rainfall. Layout is
 * responsive: rails collapse below the map on smaller screens.
 */
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Globe2, X } from "lucide-react";

import { api } from "@/lib/api";
import { formatCoord } from "@/lib/format";
import { cn } from "@/lib/utils";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { IntelligencePanel } from "@/components/panels/IntelligencePanel";
import { LayerControls } from "@/components/panels/LayerControls";
import { LocationSearch } from "@/components/panels/LocationSearch";
import { OnboardingCard } from "@/components/panels/OnboardingCard";
import { RainfallPanel } from "@/components/panels/RainfallPanel";
import { SourcesPanel } from "@/components/panels/SourcesPanel";
import { TopBar } from "@/components/panels/TopBar";
import { Chip } from "@/components/ui/primitives";

// MapLibre must not be server-rendered.
const WaterAtlasMap = dynamic(
  () => import("@/components/map/WaterAtlasMap").then((m) => m.WaterAtlasMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-abyss-950">
        <div className="flex items-center gap-2 text-xs text-ink-400">
          <Globe2 className="h-4 w-4 animate-pulse text-water-300" aria-hidden />
          Loading global map…
        </div>
      </div>
    ),
  },
);

function LocationChip() {
  const { location, clearLocation } = useWorkspace();
  if (!location) {
    return (
      <Chip title="No analysis point selected yet">
        <Globe2 className="h-3 w-3" aria-hidden />
        No location selected
      </Chip>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-water-400/25 bg-water-400/[0.07] px-3 py-1.5">
      <Globe2 className="h-3.5 w-3.5 shrink-0 text-water-300" aria-hidden />
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-ink-100">
          {location.place?.name ?? location.label}
        </span>
        <span className="block font-mono text-[0.625rem] text-ink-400">
          {formatCoord(location.latitude, "lat")} · {formatCoord(location.longitude, "lon")}
        </span>
      </span>
      <button
        type="button"
        onClick={clearLocation}
        aria-label="Clear selected location"
        className="ml-1 rounded p-0.5 text-ink-400 transition hover:text-ink-100"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

function Workspace() {
  const { summary, comparison, forecast, refresh } = useWorkspace();
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const check = () =>
      api
        .health()
        .then(() => active && setApiHealthy(true))
        .catch(() => active && setApiHealthy(false));
    void check();
    const timer = setInterval(check, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="relative z-10 flex h-dvh flex-col overflow-hidden">
      <TopBar apiHealthy={apiHealthy} />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden p-3 lg:grid-cols-[20rem_minmax(0,1fr)_22rem] xl:grid-cols-[22rem_minmax(0,1fr)_24rem]">
        {/* Left rail */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto lg:overflow-visible">
          <div className="panel space-y-3 p-3">
            <LocationSearch />
            <LocationChip />
          </div>
          <div className="hidden min-h-0 lg:block">
            <LayerControls />
          </div>
        </div>

        {/* Center map */}
        <div className="relative min-h-[52vh] overflow-hidden rounded-xl border border-white/[0.06] bg-abyss-900 shadow-panel lg:min-h-0">
          <WaterAtlasMap />
        </div>

        {/* Right rail */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto lg:pr-1">
          <OnboardingCard />
          <IntelligencePanel slice={summary} onRetry={refresh} />
          <RainfallPanel comparison={comparison} forecast={forecast} onRetry={refresh} />
          <SourcesPanel />
        </div>
      </div>
    </div>
  );
}

export default function AtlasClient() {
  return (
    <WorkspaceProvider>
      <Workspace />
    </WorkspaceProvider>
  );
}
