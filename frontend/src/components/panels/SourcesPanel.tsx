"use client";

/**
 * Data sources panel.
 *
 * Lists the provider catalog with its documented resolution, latency, licence
 * and limitations. This is where a user checks whether a source is genuinely
 * connected, key-free, or awaiting configuration.
 */
import { useEffect, useState } from "react";
import { ExternalLink, Library } from "lucide-react";

import { api } from "@/lib/api";
import type { ProviderCatalog } from "@/lib/schemas";
import { classificationStyle } from "@/lib/format";
import { ClassificationBadge, Panel, PanelHeader, Skeleton } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";

const KEY_FREE = new Set([
  "open_meteo_geocoding",
  "open_meteo_forecast",
  "open_meteo_archive",
  "open_meteo_climate",
  "open_meteo_flood",
  "nasa_power",
  "cdse_stac",
]);

export function SourcesPanel() {
  const [catalog, setCatalog] = useState<ProviderCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .providers()
      .then((data) => active && setCatalog(data))
      .catch((err: unknown) =>
        active && setError(err instanceof Error ? err.message : "Provider catalog unavailable."),
      );
    return () => {
      active = false;
    };
  }, []);

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Data sources"
        subtitle="Products, resolution, latency and limitations"
        icon={<Library className="h-4 w-4" aria-hidden />}
      />
      {error ? <ErrorState title="Provider catalog unavailable" message={error} /> : null}
      {!catalog && !error ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : null}
      {catalog ? (
        <ul className="divide-y divide-white/[0.05]">
          {catalog.providers.map((provider) => {
            const isOpen = open === provider.id;
            const free = KEY_FREE.has(provider.id);
            return (
              <li key={provider.id}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : provider.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/[0.02]"
                >
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      free ? classificationStyle(provider.classification).dot : "bg-ink-500"
                    }`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink-100">
                        {provider.name}
                      </span>
                      <ClassificationBadge
                        classification={provider.classification}
                        compact
                      />
                      {!free ? (
                        <span className="rounded border border-white/10 px-1.5 py-px text-[0.5625rem] uppercase tracking-wide text-ink-400">
                          key required
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-400">
                      {provider.product} · {provider.spatial_resolution} ·{" "}
                      {provider.temporal_resolution}
                    </span>
                  </span>
                </button>
                {isOpen ? (
                  <div className="space-y-2 bg-black/20 px-4 pb-4 pt-1 text-xs">
                    <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-ink-300">
                      <dt className="text-ink-500">Units</dt>
                      <dd>{provider.units ?? "—"}</dd>
                      <dt className="text-ink-500">Latency</dt>
                      <dd>{provider.latency_note ?? "—"}</dd>
                      <dt className="text-ink-500">Coverage</dt>
                      <dd>{provider.coverage_note ?? "—"}</dd>
                      <dt className="text-ink-500">Licence</dt>
                      <dd>{provider.license ?? "—"}</dd>
                      <dt className="text-ink-500">Attribution</dt>
                      <dd>{provider.attribution ?? "—"}</dd>
                    </dl>
                    {provider.limitations.length ? (
                      <div>
                        <p className="label-caps">Limitations</p>
                        <ul className="mt-0.5 list-inside list-disc text-ink-300">
                          {provider.limitations.map((limitation) => (
                            <li key={limitation}>{limitation}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {provider.url ? (
                      <a
                        href={provider.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-water-300 hover:text-water-200"
                      >
                        Provider documentation
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </Panel>
  );
}
