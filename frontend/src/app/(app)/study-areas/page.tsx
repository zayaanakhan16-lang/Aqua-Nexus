"use client";

/**
 * Study Areas — manage saved locations.
 *
 * Lists persisted study areas with their geographic information and lets the
 * user open, rename or delete them. When the backend is unreachable the page
 * says so plainly instead of showing an empty list as if nothing were saved.
 */
import Link from "next/link";
import { Compass, Layers, RefreshCw } from "lucide-react";

import { useStudyAreas } from "@/lib/study-areas";
import { StudyAreaCard } from "@/components/study-areas/StudyAreaCard";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/primitives";

export default function StudyAreasPage() {
  const { areas, loading, error, reload } = useStudyAreas();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label-caps text-water-300">Saved workspaces</p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink-50 sm:text-3xl">
            Study areas
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-400">
            Each study area is a saved location with its own intelligence workspace. Open one to
            investigate its weather, rainfall, modelled discharge and satellite coverage.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-medium text-ink-200 transition hover:text-ink-50"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Refresh
          </button>
          <Link
            href="/explore"
            className="inline-flex items-center gap-1.5 rounded-lg bg-water-400 px-3.5 py-2 text-xs font-semibold text-abyss-950 transition hover:bg-water-300"
          >
            <Compass className="h-3.5 w-3.5" aria-hidden />
            Explore map
          </Link>
        </div>
      </header>

      <div className="mt-8">
        {loading && !areas.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full" />
            ))}
          </div>
        ) : null}

        {!loading && error ? (
          <ErrorState title="Could not load study areas" message={error} onRetry={() => void reload()} />
        ) : null}

        {!error && !loading && areas.length === 0 ? (
          <div className="panel">
            <EmptyState
              icon={<Layers className="h-5 w-5" aria-hidden />}
              title="No study areas yet"
              description="Create your first study area from the Explore map: search for a place or click a point, then save it to open its intelligence workspace."
              action={
                <Link
                  href="/explore"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-water-400 px-4 py-2 text-sm font-semibold text-abyss-950 transition hover:bg-water-300"
                >
                  <Compass className="h-4 w-4" aria-hidden />
                  Explore the map
                </Link>
              }
            />
          </div>
        ) : null}

        {areas.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {areas.map((area) => (
              <StudyAreaCard key={area.id} area={area} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
