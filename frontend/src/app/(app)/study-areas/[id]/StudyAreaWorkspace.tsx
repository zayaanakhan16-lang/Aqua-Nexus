"use client";

/**
 * Study-area intelligence workspace.
 *
 * Loads a saved study area by id and opens the same shared intelligence tabs the
 * Explore Map uses, so a saved area and a live map selection present an identical
 * results experience. Switching areas reloads everything, because the workspace
 * store is keyed by the initial location and refetches on change.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, MapPin } from "lucide-react";

import { api } from "@/lib/api";
import { formatCoord } from "@/lib/format";
import type { StudyArea } from "@/lib/schemas";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { Chip } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/primitives";
import { IntelligenceTabs } from "@/components/workspace/IntelligenceTabs";
import { InvestigationList } from "@/components/workspace/InvestigationList";
import { MapWorkspace } from "@/components/workspace/MapWorkspace";
import { MapPanel } from "@/components/workspace/MapPanel";
import { MapAnalyticsToggle, type WorkspaceMode } from "@/components/map/MapAnalyticsToggle";

function LocationHeader({ area }: { area: StudyArea }) {
  const { summary, refresh } = useWorkspace();
  const okCount = summary.data?.providers.filter((p) => p.status === "ok").length ?? 0;
  const total = summary.data?.providers.length ?? 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-abyss-900/70 px-4 py-3 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/study-areas"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] text-ink-400 transition hover:text-ink-100"
          aria-label="Back to study areas"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-water-300/25 bg-water-300/[0.08] text-water-300">
          <MapPin className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-ink-50">{area.name}</h1>
          <p className="truncate font-mono text-xs text-ink-300">
            {formatCoord(area.location.latitude, "lat")} ·{" "}
            {formatCoord(area.location.longitude, "lon")}
            {area.place?.display_name ? ` · ${area.place.display_name}` : ""}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {summary.loading && !summary.data ? (
          <Chip>Loading sources…</Chip>
        ) : summary.data ? (
          <Chip title="Providers that returned usable data for this location">
            {okCount} of {total} sources available
          </Chip>
        ) : null}
        <button
          type="button"
          onClick={refresh}
          className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-ink-200 transition hover:text-ink-50"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

function WorkspaceBody({ area }: { area: StudyArea }) {
  const [mode, setMode] = useState<WorkspaceMode>("map");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LocationHeader area={area} />
      <div className="relative flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div className="pointer-events-none absolute inset-x-0 top-6 z-30 hidden justify-center lg:flex">
          <MapAnalyticsToggle mode={mode} onChange={setMode} className="pointer-events-auto" />
        </div>

        <div className="flex shrink-0 items-center justify-center lg:hidden">
          <MapAnalyticsToggle mode={mode} onChange={setMode} />
        </div>

        <div className="chrome hidden flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 lg:flex">
          <span className="label-caps">Data classification</span>
          {["Reanalysis", "Forecast", "Simulation", "Derived", "Catalogue"].map((kind) => (
            <span
              key={kind}
              className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-px text-3xs text-ink-300"
            >
              {kind}
            </span>
          ))}
          <span className="ml-auto text-3xs text-ink-500">
            Every value carries its source, method and limitations. Missing data stays visibly
            missing.
          </span>
        </div>

        {mode === "map" ? (
          <MapWorkspace
            rail={<InvestigationList />}
            railLabel="Investigations"
            className="min-h-[32rem] rounded-xl border border-white/[0.08] bg-abyss-950 lg:min-h-0"
          >
            <MapPanel className="absolute inset-0" showHint={false} />
          </MapWorkspace>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <IntelligenceTabs className="min-h-[36rem]" />
          </div>
        )}
      </div>
    </div>
  );
}

export function StudyAreaWorkspace({ areaId }: { areaId: string }) {
  const [area, setArea] = useState<StudyArea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getStudyArea(areaId)
      .then((data) => {
        if (active) {
          setArea(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load this study area.");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [areaId]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !area) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <ErrorState
          title="Study area not found"
          message={error ?? "This study area does not exist or could not be loaded."}
        />
        <div className="mt-4 text-center">
          <Link href="/study-areas" className="text-sm text-water-300 hover:text-water-200">
            Back to study areas
          </Link>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceProvider
      initialLocation={{
        latitude: area.location.latitude,
        longitude: area.location.longitude,
        label: area.label ?? area.name,
        place: area.place ?? null,
      }}
    >
      <WorkspaceBody area={area} />
    </WorkspaceProvider>
  );
}
