"use client";

/**
 * Reports — the report centre.
 *
 * A report is generated for a selected location, so this page is the bridge
 * between a saved investigation and its downloadable PDF. Each saved study area
 * links straight to its workspace, where the Report tab previews the exact
 * structured payload the PDF is built from and downloads it.
 *
 * With no saved areas the page says so plainly rather than showing a fake list.
 */
import Link from "next/link";
import { ArrowRight, Bookmark, FileText, MapPin, Plus } from "lucide-react";

import { useStudyAreas } from "@/lib/study-areas";
import { formatCoord, formatDateTime } from "@/lib/format";
import { Panel, PanelHeader, Skeleton } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/states";

export default function ReportsPage() {
  const { areas, loading, error } = useStudyAreas();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <p className="label-caps text-water-300">Evidence deliverables</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink-50 sm:text-3xl">
          Reports
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-400">
          Every investigation produces a professional PDF: water-presence findings, rainfall,
          flood-related evidence, satellite imagery, forecast outlook, data sources, limitations and
          an AI interpretation grounded in the actual results.
        </p>
      </header>

      <Panel className="mt-6 overflow-hidden">
        <PanelHeader
          title="Generate a report"
          subtitle="Pick a saved investigation to open its report workspace"
          icon={<FileText className="h-4 w-4" aria-hidden />}
        />

        {loading && !areas.length ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : null}

        {!loading && error ? (
          <p className="px-4 py-4 text-xs text-signal-alert">
            Could not load saved investigations: {error}
          </p>
        ) : null}

        {!loading && !error && areas.length === 0 ? (
          <EmptyState
            icon={<Bookmark className="h-5 w-5" aria-hidden />}
            title="No saved investigations yet"
            description="Select a location on the Explore Map, then save it as a study area. Its report becomes available here."
            action={
              <Link
                href="/explore"
                className="inline-flex items-center gap-1.5 rounded-lg bg-water-400 px-4 py-2 text-sm font-semibold text-abyss-950 transition hover:bg-water-300"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Start an investigation
              </Link>
            }
          />
        ) : null}

        {areas.length ? (
          <ul className="divide-y divide-white/[0.05]">
            {areas.map((area) => (
              <li key={area.id}>
                <Link
                  href={`/study-areas/${area.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.02]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-water-300">
                    <MapPin className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink-100">
                      {area.name}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[0.6875rem] text-ink-400">
                      {formatCoord(area.location.latitude, "lat")} ·{" "}
                      {formatCoord(area.location.longitude, "lon")} · updated{" "}
                      {formatDateTime(area.updated_at)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[0.6875rem] font-medium text-water-300">
                    Open report
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-500" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <div className="panel mt-6 p-4">
        <p className="text-xs font-semibold text-ink-100">What every report contains</p>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {[
            "Executive summary and key metrics",
            "Water-presence findings and evidence",
            "Nearby lakes, rivers and reservoirs",
            "Rainfall analysis and anomaly",
            "Flood-related evidence (screening)",
            "Water-stress indicators",
            "Satellite imagery and scene catalogue",
            "Environmental change comparison",
            "Future weather and rainfall outlook",
            "Data sources, methods and limitations",
            "AI interpretation grounded in results",
            "Missing data and uncertainty",
          ].map((item) => (
            <li key={item} className="flex items-start gap-1.5 text-[0.6875rem] text-ink-400">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-water-400" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
