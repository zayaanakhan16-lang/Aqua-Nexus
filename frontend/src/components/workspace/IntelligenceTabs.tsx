"use client";

/**
 * Intelligence surface — the shared, comprehensive results view.
 *
 * Renders every data category the connected providers actually support, for the
 * location currently held by the workspace store. It is a pure view over the
 * store's per-slice state: each section shows its own loading, error, empty or
 * partial state, so one failing provider never hides the categories that did
 * return data.
 *
 * Layout follows the AgriSense analytics pattern: one continuous dark surface
 * that scrolls like a single page, with a single flat section chip row at the
 * top. There is exactly one header and one section switcher — the sections below
 * never repeat them. Used by both the Explore Map workspace and the saved
 * investigation workspace, so there is exactly one results experience.
 *
 * This is the only section navigation in the product: the app shell carries no
 * tabs of its own.
 */
import { MapPin, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";
import { useStudyAreas } from "@/lib/study-areas";
import {
  WORKSPACE_GROUPS,
  WORKSPACE_SECTIONS,
  groupForTab,
  isWorkspaceTabId,
  type WorkspaceTabId,
} from "@/lib/navigation";
import { Chip, StatusDot } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/states";
import { AIAnalysisPanel } from "@/components/panels/AIAnalysisPanel";
import { ChangeDetectionPanel } from "@/components/panels/ChangeDetectionPanel";
import { DischargePanel } from "@/components/panels/DischargePanel";
import { FloodPanel } from "@/components/panels/FloodPanel";
import { OutlookPanel } from "@/components/panels/OutlookPanel";
import { WaterAtlasPanel } from "@/components/panels/WaterAtlasPanel";
import { WaterPresencePanel } from "@/components/panels/WaterPresencePanel";
import { WaterProfilePanel } from "@/components/panels/WaterProfilePanel";
import { WaterPlanningPanel } from "@/components/panels/WaterPlanningPanel";
import { GlobalLayersPanel } from "@/components/panels/GlobalLayersPanel";
import { IntelligencePanel } from "@/components/panels/IntelligencePanel";
import { RainfallPanel } from "@/components/panels/RainfallPanel";
import { ReportPanel } from "@/components/panels/ReportPanel";
import { SatellitePanel } from "@/components/panels/SatellitePanel";
import { SourcesPanel } from "@/components/panels/SourcesPanel";
import { WaterStressPanel } from "@/components/panels/WaterStressPanel";
import { WeatherPanel } from "@/components/panels/WeatherPanel";

/**
 * The section contract lives in `lib/navigation`, which also defines the eight
 * primary destinations each section belongs to. Re-exported here because this
 * module is where callers historically imported it from.
 */
export type { WorkspaceTabId } from "@/lib/navigation";

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
      <div className="flex shrink-0 items-center gap-2">
        <StatusDot tone={failed ? "caution" : "good"} label="Investigation status" />
        <span className="text-2xs text-ink-400">
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
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5"
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
                "text-2xs",
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

/**
 * Section switcher for the intelligence surface.
 *
 * One flat, horizontally scrollable chip row over every section, exactly like
 * the AgriSense analytics `SectionTabs`. The former eight primary destinations
 * are gone from the header, so this row is now the single place sections are
 * chosen — there is no second control to keep in step with it, and the group
 * labels survive only as quiet dividers that give the row structure without
 * becoming a second level of navigation.
 *
 * Arrow keys move within the row.
 */
function SectionSwitcher({
  activeId,
  onSelect,
  hasLocation,
}: {
  activeId: WorkspaceTabId;
  onSelect: (id: WorkspaceTabId) => void;
  hasLocation: boolean;
}) {
  const flat = WORKSPACE_SECTIONS;

  return (
    <div className="chrome overflow-hidden p-1">
      <div
        role="tablist"
        aria-label="Analysis sections"
        className="flex items-stretch gap-0.5 overflow-x-auto scrollbar-none"
      >
        {flat.map((t) => {
          const Icon = t.icon;
          const active = t.id === activeId;
          const blocked = Boolean(t.needsLocation) && !hasLocation;
          const startsGroup = WORKSPACE_GROUPS.some((g) => g.sections[0]?.id === t.id);
          const showDivider = startsGroup && t.id !== flat[0]?.id;
          return (
            <div key={t.id} className="flex items-stretch">
              {showDivider ? (
                <span className="mx-1 w-px shrink-0 self-stretch bg-white/[0.08]" aria-hidden />
              ) : null}
              <button
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={active}
                aria-controls={`panel-${t.id}`}
                tabIndex={active ? 0 : -1}
                title={blocked ? "Select a location to populate this section" : t.label}
                onClick={() => onSelect(t.id)}
                onKeyDown={(event) => {
                  const idx = flat.findIndex((x) => x.id === t.id);
                  if (event.key === "ArrowRight") {
                    event.preventDefault();
                    onSelect(flat[(idx + 1) % flat.length]!.id);
                  } else if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    onSelect(flat[(idx - 1 + flat.length) % flat.length]!.id);
                  }
                }}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-medium transition-colors",
                  active
                    ? "bg-water-300/[0.14] text-water-200"
                    : blocked
                      ? "text-ink-500 hover:bg-white/[0.04] hover:text-ink-300"
                      : "text-ink-400 hover:bg-white/[0.06] hover:text-ink-100",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {t.label}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function IntelligenceTabs({
  initialTab,
  tabRequest,
  onTabChange,
  className,
}: {
  initialTab?: WorkspaceTabId;
  /**
   * A tab the caller wants opened, e.g. from a URL search param. Unlike
   * `initialTab` it is honoured on later changes too, so a link to
   * `/explore?tab=flood` switches the section without a full remount.
   */
  tabRequest?: WorkspaceTabId;
  /** Notified whenever the user picks a section, so the caller can sync the URL. */
  onTabChange?: (tab: WorkspaceTabId) => void;
  className?: string;
}) {
  const {
    location,
    summary,
    comparison,
    forecast,
    history,
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
    windowDays,
    setWindowDays,
  } = useWorkspace();
  const { areas } = useStudyAreas();
  const [tab, setTab] = useState<WorkspaceTabId>(
    () => initialTab ?? (location ? "overview" : "global-layers"),
  );

  // Honour a caller-supplied section request on change (deep link navigation).
  const lastRequest = useRef<WorkspaceTabId | undefined>(tabRequest);
  useEffect(() => {
    if (tabRequest && tabRequest !== lastRequest.current) {
      setTab(tabRequest);
    }
    lastRequest.current = tabRequest;
  }, [tabRequest]);

  // Selecting a location is the moment the analysis becomes meaningful, so move
  // the user to the Overview section the first time a location is chosen. Later
  // location changes do not steal the section the user is already reading.
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

  const activeTab = WORKSPACE_SECTIONS.find((t) => t.id === tab);
  const activeGroup = groupForTab(tab);
  const blocked = Boolean(activeTab?.needsLocation) && !location;

  // The saved region the current selection corresponds to, matched on the same
  // coordinate rule the Region List uses to mark its selected card. Null when
  // the selection is a loose map point rather than a saved region.
  const selectedArea =
    areas.find(
      (a) =>
        location &&
        Math.abs(location.latitude - a.location.latitude) < 1e-6 &&
        Math.abs(location.longitude - a.location.longitude) < 1e-6,
    ) ?? null;

  return (
    <section
      aria-label="Water intelligence results"
      className={cn("flex min-h-0 flex-col overflow-hidden", className)}
    >
      {/* ------------------------------------------------------- single header */}
      <div className="chrome p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="label-caps text-water-300">{activeGroup.label}</p>
            <h2 className="mt-1 font-display text-base font-semibold text-ink-100">
              Water Intelligence
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {summary.data ? (
                <Chip title="Providers that returned usable data for this location">
                  {ok} of {total} sources available
                </Chip>
              ) : (
                <Chip>Assembling location evidence…</Chip>
              )}
              {location ? (
                <Chip title={location.place?.display_name ?? location.label}>
                  <MapPin className="h-3 w-3" aria-hidden />
                  {location.place?.name ?? location.label}
                </Chip>
              ) : null}
              {anyError ? (
                <span className="text-2xs text-signal-caution">
                  Some categories could not load — each section reports its own status.
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-2xs font-medium text-ink-300 transition hover:text-ink-50"
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
            Refresh
          </button>
        </div>

        {location ? (
          <div className="mt-3 border-t border-white/[0.07] pt-2.5">
            <InvestigationProgress />
          </div>
        ) : null}
      </div>

      {/* --------------------------------------- single section control */}
      <div className="mt-3">
        <SectionSwitcher
          activeId={tab}
          onSelect={(id) => {
            setTab(id);
            onTabChange?.(id);
          }}
          hasLocation={Boolean(location)}
        />
      </div>

      {/* --------------------------------------------------- section body */}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        <div
          id={`panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          className="mx-auto w-full max-w-6xl space-y-4 pb-4"
        >
          {blocked ? (
            <EmptyState
              icon={<MapPin className="h-5 w-5" aria-hidden />}
              title="Select a location first"
              description="Search for a place or click anywhere on the map. This section reports only real evidence for the location you choose."
            />
          ) : (
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
              {tab === "flood" ? <FloodPanel slice={floodEvidence} onRetry={refresh} /> : null}
              {tab === "outlook" ? <OutlookPanel slice={outlook} onRetry={refresh} /> : null}
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
              {tab === "profile" ? (
                <WaterProfilePanel
                  area={selectedArea}
                  areaKm2={location?.area?.area_km2 ?? null}
                  summary={summary}
                  weather={weather}
                  discharge={discharge}
                  waterBodies={waterBodies}
                  waterPresence={waterPresence}
                  onRetry={refresh}
                />
              ) : null}
              {tab === "planning" ? (
                <WaterPlanningPanel
                  area={selectedArea}
                  areaKm2={location?.area?.area_km2 ?? null}
                  summary={summary}
                  weather={weather}
                  history={history}
                  discharge={discharge}
                  waterBodies={waterBodies}
                  windowDays={windowDays}
                  onWindowChange={setWindowDays}
                />
              ) : null}
              {tab === "ai" ? <AIAnalysisPanel slice={ai} onGenerate={refreshAi} /> : null}
              {tab === "report" ? <ReportPanel /> : null}
              {tab === "sources" ? <SourcesPanel /> : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
