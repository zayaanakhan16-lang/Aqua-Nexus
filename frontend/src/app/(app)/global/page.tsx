"use client";

/**
 * Global Intelligence.
 *
 * A genuine global exploration surface, independent of any selected point. It
 * exposes the real global raster datasets the backend verified (NASA GIBS), the
 * global water-body geography layer, and an honest statement of each dataset's
 * coverage and temporal limitations.
 *
 * It does not invent country rankings or global statistics: the only numbers
 * shown are counts of layers that actually verified.
 */
import Link from "next/link";
import { ArrowRight, Compass, Globe2, Info, Layers, MapPin } from "lucide-react";

import { useWorkspace, WorkspaceProvider } from "@/lib/workspace";
import { GlobalLayersPanel } from "@/components/panels/GlobalLayersPanel";
import { MapPanel } from "@/components/workspace/MapPanel";
import { Panel, PanelHeader } from "@/components/ui/primitives";

/**
 * Hands the point the user picked on the global map to the local workspace.
 *
 * The global view has no analysis of its own: choosing a point here is only a
 * way to jump into the location-specific investigation with those coordinates.
 */
function InvestigateHere() {
  const { location } = useWorkspace();
  if (!location) {
    return (
      <p className="text-[0.6875rem] leading-relaxed text-ink-500">
        Click the map to pick a point, then open a local investigation for those exact coordinates.
      </p>
    );
  }
  const href = `/explore?lat=${location.latitude}&lon=${location.longitude}${
    location.label ? `&label=${encodeURIComponent(location.label)}` : ""
  }`;
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-lg border border-water-400/35 bg-water-400/[0.08] px-3 py-1.5 text-xs font-semibold text-water-200 transition hover:border-water-400/60 hover:bg-water-400/[0.14]"
    >
      <MapPin className="h-3.5 w-3.5" aria-hidden />
      Investigate {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}

function GlobalContent() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 lg:overflow-hidden">
      <header className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-water-400/25 bg-water-400/[0.08] text-water-300">
            <Globe2 className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-lg font-semibold text-ink-50">Global Intelligence</h1>
            <p className="text-xs text-ink-400">
              Explore the world&apos;s water and environmental datasets, then open a local
              investigation from any region.
            </p>
          </div>
        </div>
        <Link
          href="/explore"
          className="inline-flex items-center gap-2 rounded-lg bg-water-400 px-4 py-2 text-sm font-semibold text-abyss-950 transition hover:bg-water-300"
        >
          <Compass className="h-4 w-4" aria-hidden />
          Open a local investigation
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </header>

      <div className="grid min-h-0 shrink-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <MapPanel showHint={false} />
        <GlobalLayersPanel className="min-h-0" />
      </div>

      <Panel className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-100">Investigate a region locally</h2>
            <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-400">
              The global view shows datasets, not local results. Pick a point on the map to carry
              those coordinates into the full local investigation.
            </p>
          </div>
          <InvestigateHere />
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader
          title="Coverage and limitations"
          subtitle="What the global view can and cannot show"
          icon={<Layers className="h-4 w-4" aria-hidden />}
        />
        <div className="space-y-3 p-4">
          <div className="flex items-start gap-2 rounded-lg border border-water-400/20 bg-water-400/[0.05] px-3 py-2.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-water-300" aria-hidden />
            <p className="text-xs leading-relaxed text-ink-200">
              Global layers are satellite- or model-derived rasters. Their spatial resolution,
              temporal resolution and latency differ per product, and each has real gaps — persistent
              cloud, polar night, or an archive that begins only in a given year. The layer catalog
              lists each product&apos;s own resolution and attribution.
            </p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            <li className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
              <p className="text-xs font-semibold text-ink-100">Rainfall</p>
              <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-400">
                Satellite precipitation estimates and reanalysis. Near-real-time products carry a
                processing latency; forecasts are not observations.
              </p>
            </li>
            <li className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
              <p className="text-xs font-semibold text-ink-100">Surface water &amp; flooding</p>
              <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-400">
                Optical surface-water observations are cloud-limited. A water observation is not a
                flood statement; flood extent requires a validated product.
              </p>
            </li>
            <li className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
              <p className="text-xs font-semibold text-ink-100">Temperature &amp; vegetation</p>
              <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-400">
                Land-surface temperature is not air temperature, and vegetation indices are not a
                water-quality measure. Both are contextual indicators.
              </p>
            </li>
            <li className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
              <p className="text-xs font-semibold text-ink-100">Water-body geography</p>
              <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-400">
                Lake and river geometry comes from contributor mapping and is not a hydrological
                survey. Boundaries may be approximate.
              </p>
            </li>
          </ul>
          <p className="text-[0.6875rem] leading-relaxed text-ink-500">
            To investigate a specific place, open the Explore Map, select a point or draw an area,
            and run the investigation. Every local result is tied to that exact location.
          </p>
        </div>
      </Panel>
    </div>
  );
}

export default function GlobalIntelligencePage() {
  return (
    <WorkspaceProvider>
      <GlobalContent />
    </WorkspaceProvider>
  );
}
