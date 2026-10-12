"use client";

/**
 * Intelligence Home.
 *
 * The returning-user entry point: identity, the two primary actions, saved study
 * areas (with a real first-run empty state), recent investigations derived from
 * actual saved data, and live provider availability. Nothing here is fabricated
 * — with no saved areas, sections show honest empty states that route the user
 * into the real workflow.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Compass,
  Database,
  Globe2,
  Layers,
  MapPin,
  Plus,
  ShieldCheck,
} from "lucide-react";

import { api } from "@/lib/api";
import { useStudyAreas } from "@/lib/study-areas";
import { formatCoord, formatDateTime } from "@/lib/format";
import type { ProviderCatalog } from "@/lib/schemas";
import { BrandMark } from "@/components/brand/Brand";
import { ClassificationBadge, Panel, PanelHeader, Skeleton, StatusDot } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/states";

const KEY_FREE = new Set([
  "open_meteo_geocoding",
  "open_meteo_forecast",
  "open_meteo_archive",
  "open_meteo_climate",
  "open_meteo_flood",
  "nasa_power",
  "cdse_stac",
]);

function DataSourcesCard() {
  const [catalog, setCatalog] = useState<ProviderCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .providers()
      .then((data) => active && setCatalog(data))
      .catch((err: unknown) =>
        active && setError(err instanceof Error ? err.message : "Catalogue unavailable."),
      );
    return () => {
      active = false;
    };
  }, []);

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Data sources"
        subtitle="Availability for this deployment"
        icon={<Database className="h-4 w-4" aria-hidden />}
      />
      {error ? (
        <p className="px-4 py-4 text-xs text-signal-alert">{error}</p>
      ) : !catalog ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {catalog.providers.map((provider) => {
            const free = KEY_FREE.has(provider.id);
            return (
              <li key={provider.id} className="flex items-center gap-3 px-4 py-2.5">
                <StatusDot tone={free ? "good" : "muted"} label={free ? "Available" : "Key required"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-ink-100">
                    {provider.name}
                  </span>
                  <span className="block truncate text-[0.6875rem] text-ink-500">
                    {provider.product ?? provider.id}
                  </span>
                </span>
                {!free ? (
                  <span className="shrink-0 rounded border border-white/10 px-1.5 py-px text-[0.5625rem] uppercase tracking-wide text-ink-400">
                    key required
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-white/[0.06] px-4 py-2.5">
        <Link
          href="/atlas"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-400 transition hover:text-water-300"
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Review provenance &amp; limitations
        </Link>
      </div>
    </Panel>
  );
}

export default function IntelligenceHomePage() {
  const { areas, loading, error } = useStudyAreas();
  const recent = areas.slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="panel relative overflow-hidden p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(700px_320px_at_88%_-20%,rgba(18,163,201,0.18),transparent_62%)]"
        />
        <div className="max-w-2xl">
          <div className="flex items-center gap-3">
            <BrandMark className="h-10 w-10" />
            <div>
              <p className="font-display text-lg font-semibold text-ink-50">AquaNexus</p>
              <p className="text-[0.6875rem] uppercase tracking-[0.16em] text-ink-500">
                Global water intelligence
              </p>
            </div>
          </div>
          <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-ink-50 sm:text-3xl">
            Understand Water. Detect Risks. Find Solutions.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-300">
            Explore the Earth, select a location, save it as a study area, and investigate the
            weather and water conditions relevant to that place — with every value traceable to its
            source.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/explore"
              className="group inline-flex items-center gap-2 rounded-lg bg-water-400 px-5 py-2.5 text-sm font-semibold text-abyss-950 transition hover:bg-water-300"
            >
              <Compass className="h-4 w-4" aria-hidden />
              Explore map
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link
              href="/study-areas"
              className="inline-flex items-center gap-2 rounded-lg border border-white/12 bg-white/[0.02] px-5 py-2.5 text-sm font-semibold text-ink-100 transition hover:border-water-400/40 hover:bg-water-400/[0.08]"
            >
              <Plus className="h-4 w-4 text-water-300" aria-hidden />
              Create study area
            </Link>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-100">Saved study areas</h2>
              <Link href="/study-areas" className="text-xs text-water-300 hover:text-water-200">
                View all
              </Link>
            </div>

            {loading && !areas.length ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : null}

            {!loading && error ? (
              <p className="mt-3 rounded-lg border border-signal-alert/25 bg-signal-alert/[0.06] px-3 py-2 text-xs text-signal-alert">
                Could not load saved study areas: {error}
              </p>
            ) : null}

            {!loading && !error && areas.length === 0 ? (
              <div className="panel mt-3">
                <EmptyState
                  icon={<Layers className="h-5 w-5" aria-hidden />}
                  title="No study areas yet"
                  description="Start by exploring the map, selecting a location, and saving it. Your saved areas will appear here for quick access."
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

            {recent.length ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {recent.map((area) => (
                  <Link
                    key={area.id}
                    href={`/study-areas/${area.id}`}
                    className="panel flex items-start gap-3 p-4 transition hover:border-water-400/30"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-water-300">
                      <MapPin className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink-100">
                        {area.name}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-xs text-ink-400">
                        {formatCoord(area.location.latitude, "lat")} ·{" "}
                        {formatCoord(area.location.longitude, "lon")}
                      </span>
                      <span className="mt-1 block text-[0.6875rem] text-ink-500">
                        Updated {formatDateTime(area.updated_at)}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}
          </section>

          {recent.length ? (
            <section>
              <h2 className="text-sm font-semibold text-ink-100">Recently updated</h2>
              <ul className="mt-3 divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.06] bg-abyss-900/60">
                {recent.map((area) => (
                  <li key={area.id}>
                    <Link
                      href={`/study-areas/${area.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.02]"
                    >
                      <Globe2 className="h-4 w-4 shrink-0 text-water-300" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-200">
                        {area.name}
                      </span>
                      <span className="shrink-0 text-[0.6875rem] text-ink-500">
                        {formatDateTime(area.updated_at)}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-500" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="flex flex-col gap-6">
          <DataSourcesCard />
          <div className="panel p-4">
            <p className="label-caps">Scientific transparency</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <ClassificationBadge classification="reanalysis" compact />
              <ClassificationBadge classification="forecast" compact />
              <ClassificationBadge classification="simulation" compact />
              <ClassificationBadge classification="derived" compact />
            </div>
            <p className="mt-3 text-[0.6875rem] leading-relaxed text-ink-500">
              Every value carries its classification, method and limitations. Missing data stays
              visibly missing — AquaNexus never fills a gap with a plausible-looking number.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
