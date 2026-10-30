"use client";

/**
 * Intelligence tabs — the shared, comprehensive results surface.
 *
 * Renders every data category the connected providers actually support, for the
 * location currently held by the workspace store. It is a pure view over the
 * store's per-slice state: each tab shows its own loading, error, empty or
 * partial state, so one failing provider never hides the categories that did
 * return data.
 *
 * Used by both the Explore Map workspace and the saved-study-area workspace so
 * there is exactly one results experience in the product.
 */
import {
  Activity,
  CalendarClock,
  CalendarRange,
  CloudRain,
  Droplets,
  FileCheck2,
  FileText,
  Layers,
  MapPin,
  RefreshCw,
  Satellite,
  ShieldAlert,
  Sparkles,
  Thermometer,
  Waves,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";
import { Chip, StatusDot } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/states";
import { AIAnalysisPanel } from "@/components/panels/AIAnalysisPanel";
import { ChangeDetectionPanel } from "@/components/panels/ChangeDetectionPanel";
import { DischargePanel } from "@/components/panels/DischargePanel";
import { FloodPanel } from "@/components/panels/FloodPanel";
import { OutlookPanel } from "@/components/panels/OutlookPanel";
import { WaterAtlasPanel } from "@/components/panels/WaterAtlasPanel";
import { WaterPresencePanel } from "@/components/panels/WaterPresencePanel";
import { GlobalLayersPanel } from "@/components/panels/GlobalLayersPanel";
import { IntelligencePanel } from "@/components/panels/IntelligencePanel";
import { RainfallPanel } from "@/components/panels/RainfallPanel";
import { ReportPanel } from "@/components/panels/ReportPanel";
import { SatellitePanel } from "@/components/panels/SatellitePanel";
import { SourcesPanel } from "@/components/panels/SourcesPanel";
import { WaterStressPanel } from "@/components/panels/WaterStressPanel";
import { WeatherPanel } from "@/components/panels/WeatherPanel";

export type WorkspaceTabId =
  | "overview"
  | "weather"
  | "precipitation"
  | "water-presence"
  | "water-atlas"
  | "water-stress"
  | "flood"
  | "outlook"
  | "change"
  | "discharge"
  | "satellite"
  | "global-layers"
  | "ai"
  | "report"
  | "sources";

const TABS: {
  id: WorkspaceTabId;
  label: string;
  icon: typeof Activity;
  /** Tabs that do not need a selected location stay usable before one is set. */
  needsLocation?: boolean;
}[] = [
  { id: "overview", label: "Overview", icon: Activity, needsLocation: true },
  { id: "weather", label: "Weather", icon: Thermometer, needsLocation: true },
  { id: "precipitation", label: "Precipitation", icon: CloudRain, needsLocation: true },
  { id: "water-presence", label: "Water Presence", icon: Droplets, needsLocation: true },
  { id: "water-atlas", label: "Water Atlas", icon: Layers, needsLocation: true },
  { id: "water-stress", label: "Water Stress", icon: Waves, needsLocation: true },
  { id: "flood", label: "Flood", icon: ShieldAlert, needsLocation: true },
  { id: "outlook", label: "Outlook", icon: CalendarClock, needsLocation: true },
  { id: "change", label: "Change", icon: CalendarRange, needsLocation: true },
  { id: "discharge", label: "River Discharge", icon: Droplets, needsLocation: true },
  { id: "satellite", label: "Satellite Explorer", icon: Satellite, needsLocation: true },
  { id: "global-layers", label: "Global Layers", icon: Layers },
  { id: "ai", label: "AI Analysis", icon: Sparkles, needsLocation: true },
  { id: "report", label: "Report", icon: FileText, needsLocation: true },
  { id: "sources", label: "Sources & Evidence", icon: FileCheck2 },
];
/**
 * Live investigation status.
 *
 * The stages are derived from the real slice states in the workspace store, so a
 * stage only turns "done" when its underlying requests have actually settled.
 * Nothing here is a simulated progress bar, and once every stage has settled the
 * strip collapses to a single quiet "investigation complete" line.
 */
function InvestigationProgress() {
  const { investigationStages, investigationComplete } = useWorkspace();
  if (!investigationStages.length) return null;

  if (investigationComplete) {
    const failed = investigationStages.filter((s) => s.status === "failed").length;
    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 py-1.5">
        <StatusDot tone={failed ? "caution" : "good"} label="Investigation status" />
        <span className="text-[0.6875rem] text-ink-400">
          Investigation complete
          {failed
            ? ` — ${failed} stage${failed === 1 ? "" : "s"} could not reach its source`
            : " — all stages returned"}
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-white/[0.06] px-3 py-2"
      aria-live="polite"
      aria-label="Investigation progress"
    >
      {investigationStages.map((stage) => {
        const tone =
          stage.status === "done"
            ? "good"
            : stage.status === "failed"
              ? "caution"
              : stage.status === "running"
                ? "info"
                : "muted";
        return (
          <span key={stage.id} className="inline-flex items-center gap-1.5">
            <StatusDot tone={tone} pulse={stage.status === "running"} label={stage.status} />
            <span
              className={cn(
                "text-[0.6875rem]",
                stage.status === "pending" ? "text-ink-500" : "text-ink-300",
              )}
            >
              {stage.label}
              {stage.total > 1 ? ` (${stage.done}/${stage.total})` : ""}
            </span>
          </span>
        );
      })}
    </div>
  );
}



export function IntelligenceTabs({
  initialTab,
  tabRequest,
  className,
}: {
  initialTab?: WorkspaceTabId;
  /**
   * A tab the caller wants opened, e.g. from a URL search param. Unlike
   * `initialTab` it is honoured on later changes too, so a sidebar link to
   * `/explore?tab=flood` switches the tab without a full remount.
   */
  tabRequest?: WorkspaceTabId;
  className?: string;
}) {
  const {
    location,
    summary,
    comparison,
    forecast,
    weather,
    discharge,
    scenes,
    hls,
    ai,
    waterPresence,
    waterBodies,
    floodEvidence,
    outlook,
    changeDetection,
    refresh,
    refreshAi,
  } = useWorkspace();
  const [tab, setTab] = useState<WorkspaceTabId>(() => initialTab ?? (location ? "overview" : "global-layers"));

  // Honour a caller-supplied tab request on change (deep link navigation).
  const lastRequest = useRef<WorkspaceTabId | undefined>(tabRequest);
  useEffect(() => {
    if (tabRequest && tabRequest !== lastRequest.current) {
      setTab(tabRequest);
    }
    lastRequest.current = tabRequest;
  }, [tabRequest]);

  // Selecting a location is the moment the analysis becomes meaningful, so move
  // the user to the Overview tab the first time a location is chosen. Later
  // location changes do not steal the tab the user is already reading.
  const hadLocation = useRef(Boolean(location));
  useEffect(() => {
    if (location && !hadLocation.current) {
      setTab("overview");
    }
    hadLocation.current = Boolean(location);
  }, [location]);

  const ok = summary.data?.providers.filter((p) => p.status === "ok").length ?? 0;
  const total = summary.data?.providers.length ?? 0;
  const anyError = Boolean(
    summary.error ||
      comparison.error ||
      forecast.error ||
      weather.error ||
      waterPresence.error ||
      floodEvidence.error ||
      outlook.error ||
      changeDetection.error ||
      waterBodies.error,
  );

  return (
    <div className={cn("panel flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {summary.data ? (
            <Chip title="Providers that returned usable data for this location">
              {ok} of {total} sources available
            </Chip>
          ) : (
            <Chip>Assembling location evidence…</Chip>
          )}
          {anyError ? (
            <span className="text-[0.6875rem] text-signal-caution">
              Some categories could not load — each tab reports its own status.
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-ink-400 transition hover:text-water-300"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          Refresh
        </button>
      </div>

      {location ? <InvestigationProgress /> : null}

      <div
        role="tablist"
        aria-label="Intelligence sections"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/[0.06] px-2"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          const blocked = Boolean(t.needsLocation) && !location;
          return (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={active}
              aria-controls={`panel-${t.id}`}
              tabIndex={active ? 0 : -1}
              title={blocked ? "Select a location to populate this section" : undefined}
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          id={`panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          className="mx-auto w-full max-w-6xl p-3"
        >
          {(() => {
            const activeTab = TABS.find((t) => t.id === tab);
            if (activeTab?.needsLocation && !location) {
              return (
                <EmptyState
                  icon={<MapPin className="h-5 w-5" aria-hidden />}
                  title="Select a location first"
                  description="Search for a place or click anywhere on the map. This section reports only real evidence for the location you choose."
                />
              );
            }
            return (
              <>
                {tab === "overview" ? (
                  <IntelligencePanel slice={summary} onRetry={refresh} />
                ) : null}
                {tab === "weather" ? <WeatherPanel slice={weather} onRetry={refresh} /> : null}
                {tab === "precipitation" ? (
                  <RainfallPanel comparison={comparison} forecast={forecast} onRetry={refresh} />
                ) : null}
                {tab === "water-presence" ? (
                  <WaterPresencePanel slice={waterPresence} onRetry={refresh} />
                ) : null}
                {tab === "water-atlas" ? (
                  <WaterAtlasPanel slice={waterBodies} onRetry={refresh} />
                ) : null}
                {tab === "flood" ? (
                  <FloodPanel slice={floodEvidence} onRetry={refresh} />
                ) : null}
                {tab === "outlook" ? (
                  <OutlookPanel slice={outlook} onRetry={refresh} />
                ) : null}
                {tab === "change" ? (
                  <ChangeDetectionPanel slice={changeDetection} onRetry={refresh} />
                ) : null}
                {tab === "water-stress" ? (
                  <WaterStressPanel slice={summary} onRetry={refresh} />
                ) : null}
                {tab === "discharge" ? (
                  <DischargePanel slice={discharge} onRetry={refresh} />
                ) : null}
                {tab === "satellite" ? (
                  <SatellitePanel slice={scenes} hls={hls} onRetry={refresh} />
                ) : null}
                {tab === "global-layers" ? <GlobalLayersPanel /> : null}
                {tab === "ai" ? <AIAnalysisPanel slice={ai} onGenerate={refreshAi} /> : null}
                {tab === "report" ? <ReportPanel /> : null}
                {tab === "sources" ? <SourcesPanel /> : null}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
