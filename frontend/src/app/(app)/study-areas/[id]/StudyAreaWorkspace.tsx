"use client";

/**
 * Study-area intelligence workspace.
 *
 * Loads a saved study area by id, then opens a location-specific workspace whose
 * header (name, coordinates) stays visible across tabs. Each tab renders the
 * real provider data for *this* area; switching areas reloads everything, since
 * the workspace store is keyed by the initial location and refetches on change.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  CloudRain,
  Droplets,
  FileCheck2,
  Globe2,
  Layers,
  MapPin,
  Satellite,
  Sparkles,
  Thermometer,
  Waves,
} from "lucide-react";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatCoord } from "@/lib/format";
import type { StudyArea } from "@/lib/schemas";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { Chip, ClassificationBadge, Skeleton } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import { IntelligencePanel } from "@/components/panels/IntelligencePanel";
import { RainfallPanel } from "@/components/panels/RainfallPanel";
import { WeatherPanel } from "@/components/panels/WeatherPanel";
import { WaterStressPanel } from "@/components/panels/WaterStressPanel";
import { DischargePanel } from "@/components/panels/DischargePanel";
import { SatellitePanel } from "@/components/panels/SatellitePanel";
import { SourcesPanel } from "@/components/panels/SourcesPanel";
import { AIAnalysisPanel } from "@/components/panels/AIAnalysisPanel";
import { LayerControls } from "@/components/panels/LayerControls";

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

type TabId =
  | "overview"
  | "weather"
  | "precipitation"
  | "water-stress"
  | "discharge"
  | "satellite"
  | "ai"
  | "sources";

const TABS: { id: TabId; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "weather", label: "Weather", icon: Thermometer },
  { id: "precipitation", label: "Precipitation", icon: CloudRain },
  { id: "water-stress", label: "Water Stress", icon: Waves },
  { id: "discharge", label: "River Discharge", icon: Droplets },
  { id: "satellite", label: "Satellite Explorer", icon: Satellite },
  { id: "ai", label: "AI Analysis", icon: Sparkles },
  { id: "sources", label: "Sources & Evidence", icon: FileCheck2 },
];

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
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-water-400/25 bg-water-400/[0.08] text-water-300">
          <MapPin className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-ink-50">{area.name}</h1>
          <p className="truncate font-mono text-xs text-ink-400">
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
  const { summary, comparison, forecast, weather, discharge, scenes, ai, refresh, refreshAi } =
    useWorkspace();
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LocationHeader area={area} />

      <div
        role="tablist"
        aria-label="Intelligence sections"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/[0.06] bg-abyss-900/40 px-2"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={active}
              aria-controls={`panel-${t.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(event) => {
                const idx = TABS.findIndex((x) => x.id === t.id);
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  setTab(TABS[(idx + 1) % TABS.length]!.id);
                } else if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  setTab(TABS[(idx - 1 + TABS.length) % TABS.length]!.id);
                }
              }}
              className={cn(
                "relative inline-flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition",
                active ? "text-water-200" : "text-ink-400 hover:text-ink-200",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {t.label}
              {active ? (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-water-300" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div
          id={`panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          className="mx-auto grid max-w-7xl gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]"
        >
          <div className="flex min-h-0 flex-col gap-3">
            {tab === "overview" ? (
              <>
                <div className="relative min-h-[48vh] overflow-hidden rounded-xl border border-white/[0.06] bg-abyss-900 shadow-panel">
                  <WaterAtlasMap />
                </div>
                <IntelligencePanel slice={summary} onRetry={refresh} />
              </>
            ) : null}
            {tab === "weather" ? <WeatherPanel slice={weather} onRetry={refresh} /> : null}
            {tab === "precipitation" ? (
              <RainfallPanel comparison={comparison} forecast={forecast} onRetry={refresh} />
            ) : null}
            {tab === "water-stress" ? (
              <WaterStressPanel slice={summary} onRetry={refresh} />
            ) : null}
            {tab === "discharge" ? <DischargePanel slice={discharge} onRetry={refresh} /> : null}
            {tab === "satellite" ? <SatellitePanel slice={scenes} onRetry={refresh} /> : null}
            {tab === "ai" ? <AIAnalysisPanel slice={ai} onGenerate={refreshAi} /> : null}
            {tab === "sources" ? (
              <>
                <IntelligencePanel slice={summary} onRetry={refresh} />
                <SourcesPanel />
              </>
            ) : null}
          </div>

          <aside className="flex min-h-0 flex-col gap-3">
            <LayerControls />
            <div className="panel p-4">
              <p className="label-caps">Data classification</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <ClassificationBadge classification="reanalysis" compact />
                <ClassificationBadge classification="forecast" compact />
                <ClassificationBadge classification="simulation" compact />
                <ClassificationBadge classification="derived" compact />
              </div>
              <p className="mt-3 text-[0.6875rem] leading-relaxed text-ink-500">
                Values in this workspace mix reanalysis, forecast, simulation and AquaNexus-derived
                signals. Each tab labels what it shows; they are never interchangeable.
              </p>
            </div>
            {tab === "overview" ? <SourcesPanel /> : null}
          </aside>
        </div>
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
