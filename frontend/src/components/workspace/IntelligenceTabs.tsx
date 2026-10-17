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
  CloudRain,
  Droplets,
  FileCheck2,
  RefreshCw,
  Satellite,
  Sparkles,
  Thermometer,
  Waves,
} from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";
import { Chip } from "@/components/ui/primitives";
import { AIAnalysisPanel } from "@/components/panels/AIAnalysisPanel";
import { DischargePanel } from "@/components/panels/DischargePanel";
import { IntelligencePanel } from "@/components/panels/IntelligencePanel";
import { RainfallPanel } from "@/components/panels/RainfallPanel";
import { SatellitePanel } from "@/components/panels/SatellitePanel";
import { SourcesPanel } from "@/components/panels/SourcesPanel";
import { WaterStressPanel } from "@/components/panels/WaterStressPanel";
import { WeatherPanel } from "@/components/panels/WeatherPanel";

export type WorkspaceTabId =
  | "overview"
  | "weather"
  | "precipitation"
  | "water-stress"
  | "discharge"
  | "satellite"
  | "ai"
  | "sources";

const TABS: { id: WorkspaceTabId; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "weather", label: "Weather", icon: Thermometer },
  { id: "precipitation", label: "Precipitation", icon: CloudRain },
  { id: "water-stress", label: "Water Stress", icon: Waves },
  { id: "discharge", label: "River Discharge", icon: Droplets },
  { id: "satellite", label: "Satellite Explorer", icon: Satellite },
  { id: "ai", label: "AI Analysis", icon: Sparkles },
  { id: "sources", label: "Sources & Evidence", icon: FileCheck2 },
];

export function IntelligenceTabs({
  initialTab = "overview",
  className,
}: {
  initialTab?: WorkspaceTabId;
  className?: string;
}) {
  const {
    summary,
    comparison,
    forecast,
    weather,
    discharge,
    scenes,
    ai,
    refresh,
    refreshAi,
  } = useWorkspace();
  const [tab, setTab] = useState<WorkspaceTabId>(initialTab);

  const ok = summary.data?.providers.filter((p) => p.status === "ok").length ?? 0;
  const total = summary.data?.providers.length ?? 0;
  const anyError = Boolean(
    summary.error || comparison.error || forecast.error || weather.error,
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

      <div
        role="tablist"
        aria-label="Intelligence sections"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/[0.06] px-2"
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          id={`panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          className="mx-auto w-full max-w-6xl p-3"
        >
          {tab === "overview" ? <IntelligencePanel slice={summary} onRetry={refresh} /> : null}
          {tab === "weather" ? <WeatherPanel slice={weather} onRetry={refresh} /> : null}
          {tab === "precipitation" ? (
            <RainfallPanel comparison={comparison} forecast={forecast} onRetry={refresh} />
          ) : null}
          {tab === "water-stress" ? <WaterStressPanel slice={summary} onRetry={refresh} /> : null}
          {tab === "discharge" ? <DischargePanel slice={discharge} onRetry={refresh} /> : null}
          {tab === "satellite" ? <SatellitePanel slice={scenes} onRetry={refresh} /> : null}
          {tab === "ai" ? <AIAnalysisPanel slice={ai} onGenerate={refreshAi} /> : null}
          {tab === "sources" ? <SourcesPanel /> : null}
        </div>
      </div>
    </div>
  );
}
