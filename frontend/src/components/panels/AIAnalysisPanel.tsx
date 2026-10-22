"use client";

/**
 * AI Analysis tab.
 *
 * Two clearly separated layers:
 *  1. The evidence package — real values from real providers, always shown, each
 *     with unit, period, classification and source.
 *  2. The AI narrative — the model's interpretation, shown only when a provider
 *     is configured and reachable, and never presented as a measurement.
 *
 * Analysis is generated on demand so a location switch never triggers a model
 * call by itself. Unconfigured and unavailable states are explicit; the evidence
 * is still displayed so the tab is useful without any AI credential.
 */
import {
  AlertTriangle,
  ChevronDown,
  Compass,
  Info,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

import type { AINarrative, AIAnalysisReport, EvidenceObservation } from "@/lib/schemas";
import { classificationStyle, formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SliceState } from "@/lib/workspace";
import {
  ClassificationBadge,
  Panel,
  PanelHeader,
  Skeleton,
  StatusDot,
} from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";

const NARRATIVE_SECTIONS: { key: keyof AINarrative; label: string; tone?: string }[] = [
  { key: "observed_conditions", label: "Observed conditions" },
  { key: "recent_changes", label: "Recent changes" },
  { key: "potential_concerns", label: "Potential concerns", tone: "caution" },
  { key: "confidence_and_limitations", label: "Confidence & limitations", tone: "muted" },
  { key: "investigate_next", label: "What to investigate next" },
  { key: "recommended_next_steps", label: "Recommended next steps" },
];

function ObservationRow({ obs }: { obs: EvidenceObservation }) {
  const ok = obs.status === "ok" && obs.value !== null;
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <StatusDot tone={ok ? "good" : "caution"} label={obs.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-sm text-ink-100">{obs.label}</p>
          <p className="shrink-0 font-mono text-sm text-ink-100">
            {ok ? (
              <>
                {formatNumber(obs.value, 1)}
                <span className="ml-1 text-xs text-ink-400">{obs.unit}</span>
              </>
            ) : (
              <span className="text-xs text-ink-400">unavailable</span>
            )}
          </p>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] text-ink-500">
          <span>{obs.source}</span>
          {obs.period ? <span>· {obs.period}</span> : null}
          {obs.classification ? (
            <ClassificationBadge classification={obs.classification} compact />
          ) : null}
        </div>
      </div>
    </li>
  );
}

function NarrativeBody({ narrative }: { narrative: AINarrative }) {
  return (
    <div className="space-y-4">
      {narrative.situation_summary ? (
        <p className="text-sm leading-relaxed text-ink-200">{narrative.situation_summary}</p>
      ) : null}
      {NARRATIVE_SECTIONS.map((section) => {
        const items = narrative[section.key];
        if (!Array.isArray(items) || items.length === 0) return null;
        return (
          <div key={section.key}>
            <p className="label-caps">{section.label}</p>
            <ul className="mt-1.5 space-y-1.5">
              {items.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink-300">
                  <span
                    className={cn(
                      "mt-1.5 h-1 w-1 shrink-0 rounded-full",
                      section.tone === "caution"
                        ? "bg-signal-caution"
                        : section.tone === "muted"
                          ? "bg-ink-500"
                          : "bg-water-400",
                    )}
                    aria-hidden
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function AIAnalysisPanel({
  slice,
  onGenerate,
}: {
  slice: SliceState<AIAnalysisReport>;
  onGenerate: () => void;
}) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const report = slice.data;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="AI analysis"
        subtitle="Evidence-grounded interpretation"
        icon={<Sparkles className="h-4 w-4" aria-hidden />}
      />
      <div className="space-y-4 p-4">
        <div className="flex items-start gap-2 rounded-lg border border-water-400/20 bg-water-400/[0.05] px-3 py-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-water-300" aria-hidden />
          <p className="text-xs leading-relaxed text-ink-300">
            The narrative is a model&apos;s interpretation of the evidence below — not a
            measurement, and not an official warning. Every value it reasons over comes from a
            named provider and is shown with its unit, period and classification.
          </p>
        </div>

        {!report && !slice.loading ? (
          <button
            type="button"
            onClick={onGenerate}
            className="inline-flex items-center gap-2 rounded-lg bg-water-400 px-4 py-2.5 text-sm font-semibold text-abyss-950 transition hover:bg-water-300"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            Generate analysis
          </button>
        ) : null}

        {slice.loading ? (
          <div className="flex items-center gap-2 text-xs text-ink-400">
            <Loader2 className="h-4 w-4 animate-spin text-water-300" aria-hidden />
            Assembling evidence and generating the analysis…
          </div>
        ) : null}

        {slice.error && !slice.loading ? (
          <ErrorState title="Could not generate the analysis" message={slice.error} onRetry={onGenerate} />
        ) : null}

        {report ? (
          <>
            {report.status === "ok" && report.narrative ? (
              <NarrativeBody narrative={report.narrative} />
            ) : null}

            {report.status === "insufficient_evidence" ? (
              <div className="flex items-start gap-2 rounded-lg border border-signal-caution/25 bg-signal-caution/[0.06] px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-signal-caution" aria-hidden />
                <div>
                  <p className="text-xs font-semibold text-ink-100">Insufficient evidence</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-300">
                    {report.message ??
                      "Too few usable observations were retrieved to interpret this location honestly."}{" "}
                    No narrative was generated, and none is implied.
                  </p>
                </div>
              </div>
            ) : null}

            {report.status === "unconfigured" ? (
              <div className="flex items-start gap-2 rounded-lg border border-signal-caution/25 bg-signal-caution/[0.06] px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-signal-caution" aria-hidden />
                <div>
                  <p className="text-xs font-semibold text-ink-100">AI analysis unavailable</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-300">
                    {report.message ??
                      "This deployment has no AI provider configured. The evidence below is still available."}
                  </p>
                </div>
              </div>
            ) : null}

            {report.status === "unavailable" ? (
              <div className="flex items-start gap-2 rounded-lg border border-signal-alert/25 bg-signal-alert/[0.06] px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-signal-alert" aria-hidden />
                <div>
                  <p className="text-xs font-semibold text-ink-100">
                    The AI provider could not be reached
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-300">
                    {report.message ?? "The analysis service is temporarily unavailable."} The
                    evidence below is unaffected.
                  </p>
                </div>
              </div>
            ) : null}

            {report.status === "ok" ? (
              <button
                type="button"
                onClick={onGenerate}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-400 transition hover:text-water-300"
              >
                <RefreshCw className="h-3 w-3" aria-hidden />
                Regenerate analysis
              </button>
            ) : null}

            {/* Evidence package — always present, regardless of AI status. */}
            <div className="rounded-lg border border-white/[0.06]">
              <button
                type="button"
                onClick={() => setEvidenceOpen((v) => !v)}
                aria-expanded={evidenceOpen}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2 text-xs font-semibold text-ink-200">
                  <Compass className="h-3.5 w-3.5 text-water-300" aria-hidden />
                  Evidence used ({report.evidence.observations.length})
                </span>
                <ChevronDown
                  className={cn("h-4 w-4 text-ink-400 transition-transform", evidenceOpen && "rotate-180")}
                  aria-hidden
                />
              </button>
              {evidenceOpen ? (
                <>
                  <ul className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
                    {report.evidence.observations.map((obs) => (
                      <ObservationRow key={obs.key} obs={obs} />
                    ))}
                  </ul>
                  {report.evidence.missing.length ? (
                    <div className="border-t border-white/[0.06] px-4 py-3">
                      <p className="label-caps">Missing or out of coverage</p>
                      <ul className="mt-1 list-inside list-disc text-xs text-ink-400">
                        {report.evidence.missing.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>

            <p className="text-[0.6875rem] text-ink-500">
              Generated {formatDateTime(report.evidence.generated_at)}
              {report.status === "ok" ? ` · ${report.provider}` : ""}
              {report.model ? ` · model ${report.model}` : ""}
            </p>
          </>
        ) : null}
      </div>
    </Panel>
  );
}
