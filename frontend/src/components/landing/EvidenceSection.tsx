"use client";

/**
 * Evidence & trust section.
 *
 * Explains the classification taxonomy and, where the backend is reachable,
 * renders the real provider catalogue with links to source documentation. When
 * the catalogue cannot be loaded the section says so and links to the project's
 * own source documents — it never presents a hardcoded "all connected" list.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, ExternalLink, Github, ShieldCheck } from "lucide-react";

import { api } from "@/lib/api";
import { CLASSIFICATION_STYLES, classificationStyle } from "@/lib/format";
import type { DataClassification, ProviderCatalog } from "@/lib/schemas";
import { ClassificationBadge, Panel, PanelHeader, Skeleton } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import { Reveal } from "@/components/landing/Reveal";
import { BackendStatusChip } from "@/components/landing/BackendStatusChip";

const TAXONOMY: DataClassification[] = [
  "observation",
  "satellite_estimate",
  "reanalysis",
  "forecast",
  "simulation",
  "derived",
];

export function EvidenceSection() {
  const [catalog, setCatalog] = useState<ProviderCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .providers()
      .then((data) => {
        if (active) setCatalog(data);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Provider catalogue unavailable.");
      });
    return () => {
      active = false;
    };
  }, []);

  const providers = catalog ? [...catalog.providers].sort((a, b) => a.name.localeCompare(b.name)) : [];

  return (
    <section id="sources" className="grid-lines border-t border-white/[0.06] py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-3xl">
          <p className="label-caps text-water-300">Evidence &amp; trust</p>
          <h2 className="mt-3 text-balance font-display text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
            Observations, forecasts and models are not interchangeable
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-300">
            Every value in AquaNexus carries its classification, its method and its
            limitations. That makes it possible to see when a signal is a measurement, a
            model reconstruction, or a prediction — and to judge how much weight it deserves.
          </p>
        </Reveal>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TAXONOMY.map((key) => {
            const style = CLASSIFICATION_STYLES[key];
            return (
              <li key={key} className="panel p-4">
                <ClassificationBadge classification={key} />
                <p className="mt-2.5 text-sm leading-relaxed text-ink-400">{style.description}</p>
              </li>
            );
          })}
        </ul>

        <Reveal className="mt-12">
          <Panel className="overflow-hidden">
            <PanelHeader
              title="Integrated data sources"
              subtitle="Products, classification and documentation"
              icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.05] px-4 py-2.5">
              <span className="text-[0.6875rem] text-ink-500">
                Catalogue served by the AquaNexus backend
              </span>
              <BackendStatusChip />
            </div>
            {error ? (
              <ErrorState
                title="Provider catalogue unavailable"
                message={`${error} The workspace still resolves each source's attribution and limitations when it can reach the backend.`}
              />
            ) : null}
            {!catalog && !error ? (
              <div className="grid gap-2 p-4 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : null}
            {catalog ? (
              <ul className="grid gap-px bg-white/[0.04] sm:grid-cols-2">
                {providers.map((provider) => (
                  <li key={provider.id} className="bg-abyss-900/80 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink-100">{provider.name}</span>
                      <ClassificationBadge classification={provider.classification} compact />
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-ink-400">
                      {provider.product ?? "—"}
                      {provider.spatial_resolution ? ` · ${provider.spatial_resolution}` : ""}
                      {provider.units ? ` · ${provider.units}` : ""}
                    </p>
                    {provider.attribution ? (
                      <p className="mt-1 text-[0.6875rem] text-ink-500">{provider.attribution}</p>
                    ) : null}
                    {provider.url ? (
                      <a
                        href={provider.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-water-300 transition hover:text-water-200"
                      >
                        Documentation
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>
        </Reveal>

        <Reveal className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Link
            href="/atlas"
            className="group inline-flex items-center gap-2 rounded-lg bg-water-400 px-4 py-2.5 text-sm font-semibold text-abyss-950 transition hover:bg-water-300"
          >
            See source status in the workspace
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
          </Link>
          <a
            href="https://github.com/zayaanakhan16-lang/Aqua-Nexus/blob/main/docs/DATA_SOURCES.md"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 text-sm text-ink-300 transition hover:text-ink-50"
          >
            <BookOpen className="h-4 w-4 text-water-300" aria-hidden />
            Data sources documentation
          </a>
          <a
            href="https://github.com/zayaanakhan16-lang/Aqua-Nexus/blob/main/docs/SCIENCE.md"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 text-sm text-ink-300 transition hover:text-ink-50"
          >
            <Github className="h-4 w-4 text-water-300" aria-hidden />
            Methods &amp; limitations
          </a>
        </Reveal>

        {/* Honesty note: classification dot legend for quick scanning. */}
        <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.6875rem] text-ink-500">
          <span className="text-ink-400">Colour key:</span>
          {TAXONOMY.map((key) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${classificationStyle(key).dot}`} aria-hidden />
              {CLASSIFICATION_STYLES[key].short}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
