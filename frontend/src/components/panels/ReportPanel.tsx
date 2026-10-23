"use client";

/**
 * Report tab — previews and downloads the branded AquaNexus PDF report.
 *
 * The preview is the *actual* structured payload the PDF is built from, fetched
 * from the backend for the selected location and window. A judge can therefore
 * see exactly which sections are present, which are unavailable and why, before
 * generating anything. The download streams the server-rendered PDF; the
 * returned report id and completeness header are shown so the artefact is
 * traceable.
 *
 * The report is only offered once a location is selected. When AI generation is
 * unavailable the report still contains the verified numeric indicators and
 * rule-based findings, and says plainly that no AI interpretation was produced.
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Info,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";
import { formatDateTime, formatIndicatorValue } from "@/lib/format";
import type { ReportPayload, ReportSection } from "@/lib/schemas";
import { Chip, ClassificationBadge, Skeleton } from "@/components/ui/primitives";
import { EmptyState, ErrorState, UnavailableNotice } from "@/components/ui/states";

const COMPLETENESS_TONE: Record<string, { label: string; className: string }> = {
  complete: { label: "Complete evidence", className: "border-signal-good/30 bg-signal-good/10 text-signal-good" },
  partial: { label: "Partial evidence", className: "border-signal-caution/30 bg-signal-caution/10 text-signal-caution" },
  minimal: { label: "Minimal evidence", className: "border-signal-alert/30 bg-signal-alert/10 text-signal-alert" },
};

function SectionCard({ section }: { section: ReportSection }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-3">
      <p className="text-xs font-semibold text-ink-100">{section.title}</p>
      {section.available ? (
        <div className="mt-1.5 space-y-1.5">
          {section.body ? (
            <p className="text-[0.6875rem] leading-relaxed text-ink-300">{section.body}</p>
          ) : null}
          {section.items.length ? (
            <ul className="space-y-1">
              {section.items.map((item, index) => (
                <li
                  key={`${item}-${index}`}
                  className="flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-ink-400"
                >
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-water-400" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-ink-500">
          {section.unavailable_reason ?? "Not available for this selection."}
        </p>
      )}
    </div>
  );
}

export function ReportPanel({ className }: { className?: string }) {
  const { location, windowDays } = useWorkspace();
  const [preview, setPreview] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [includeAi, setIncludeAi] = useState(true);

  const loadPreview = useCallback(async () => {
    if (!location) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await api.reportPreview(location.latitude, location.longitude, {
        name: location.place?.name ?? location.label,
        windowDays,
        includeAi,
      });
      setPreview(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the report preview.");
    } finally {
      setLoading(false);
    }
  }, [location, windowDays, includeAi]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const download = useCallback(async () => {
    if (!location) return;
    setGenerating(true);
    setGenerateError(null);
    setDownloadInfo(null);
    try {
      const { blob, reportId, completeness } = await api.generateReport({
        latitude: location.latitude,
        longitude: location.longitude,
        name: location.place?.name ?? location.label,
        label: location.label,
        windowDays,
        includeAi,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${reportId ?? "AquaNexus-report"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDownloadInfo(
        `Downloaded ${reportId ?? "report"}${completeness ? ` (${completeness} evidence)` : ""}.`,
      );
    } catch (err) {
      setGenerateError(
        err instanceof ApiError
          ? `${err.message}${err.isUnavailable ? " The report generator is currently unavailable." : ""}`
          : "Report generation failed.",
      );
    } finally {
      setGenerating(false);
    }
  }, [location, windowDays, includeAi]);

  if (!location) {
    return (
      <EmptyState
        icon={<FileText className="h-5 w-5" aria-hidden />}
        title="Select a location to build a report"
        description="Choose a study area on the map or search for a place. AquaNexus assembles the report from that selection's real analysis."
      />
    );
  }

  if (loading && !preview) {
    return (
      <div className={cn("space-y-3", className)}>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error && !preview) {
    return <ErrorState title="Report preview unavailable" message={error} onRetry={loadPreview} />;
  }

  if (!preview) return null;

  const tone = COMPLETENESS_TONE[preview.completeness] ?? COMPLETENESS_TONE.partial!;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-water-300" aria-hidden />
              <p className="text-sm font-semibold text-ink-100">AquaNexus report</p>
            </div>
            <p className="mt-1 text-xs text-ink-300">
              {preview.study_area_name} · {preview.analysis_start} → {preview.analysis_end}
            </p>
            <p className="mt-0.5 font-mono text-[0.625rem] text-ink-500">{preview.report_id}</p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-md border px-2 py-1 text-[0.625rem] font-semibold uppercase tracking-wide",
              tone.className,
            )}
          >
            {tone.label}
          </span>
        </div>

        <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-400">
          {preview.completeness_note}
        </p>

        <label className="mt-3 flex items-center gap-2 text-[0.6875rem] text-ink-300">
          <input
            type="checkbox"
            checked={includeAi}
            onChange={(e) => setIncludeAi(e.target.checked)}
            className="h-3.5 w-3.5 accent-water-400"
          />
          Include AI interpretation when the provider is configured
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={download}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-lg bg-water-400 px-4 py-2 text-sm font-semibold text-abyss-950 transition hover:bg-water-300 disabled:opacity-60"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Download className="h-4 w-4" aria-hidden />
            )}
            {generating ? "Generating PDF…" : "Download PDF report"}
          </button>
          <button
            type="button"
            onClick={loadPreview}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-medium text-ink-200 transition hover:border-water-400/40 hover:bg-water-400/[0.08] disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
            Refresh preview
          </button>
        </div>

        {downloadInfo ? (
          <p className="mt-2 flex items-center gap-1.5 text-[0.6875rem] text-signal-good">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {downloadInfo}
          </p>
        ) : null}
        {generateError ? (
          <p className="mt-2 flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-signal-alert">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {generateError}
          </p>
        ) : null}
      </div>

      {preview.metrics.length ? (
        <div className="panel p-4">
          <p className="label-caps">Key metrics</p>
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {preview.metrics.map((metric) => {
              const display = formatIndicatorValue(metric);
              return (
              <div
                key={metric.key}
                className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-2.5 py-2"
                title={metric.method ?? undefined}
              >
                <dt className="truncate text-[0.625rem] text-ink-500">{metric.label}</dt>
                <dd className="mt-0.5 font-mono text-sm text-ink-100">
                  {display.value}
                  {metric.unit ? (
                    <span className="ml-1 text-[0.625rem] text-ink-400">{display.unit}</span>
                  ) : null}
                </dd>
                {metric.classification ? (
                  <dd className="mt-1">
                    <ClassificationBadge classification={metric.classification} compact />
                  </dd>
                ) : null}
              </div>
              );
            })}
          </dl>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <SectionCard section={preview.executive_summary} />
        <SectionCard section={preview.observed_conditions} />
        <SectionCard section={preview.rainfall_findings} />
        <SectionCard section={preview.heat_findings} />
        <SectionCard section={preview.flood_findings} />
        <SectionCard section={preview.surface_water_findings} />
        <SectionCard section={preview.dry_condition_findings} />
        <SectionCard section={preview.data_quality} />
        <SectionCard section={preview.follow_up} />
      </div>

      {preview.ai_generated ? (
        <SectionCard section={preview.ai_interpretation} />
      ) : (
        <UnavailableNotice
          title="AI interpretation not included"
          message={
            preview.ai_interpretation.unavailable_reason ??
            "No AI interpretation was generated for this report. The verified metrics and rule-based findings above are unaffected."
          }
        />
      )}

      {preview.sources.length ? (
        <div className="panel p-4">
          <p className="label-caps">Data sources &amp; provenance</p>
          <ul className="mt-2 space-y-2">
            {preview.sources.map((source) => (
              <li
                key={source.provider_id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.015] px-2.5 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-[0.6875rem] font-medium text-ink-200">
                  {source.provider_name}
                </span>
                {source.classification ? (
                  <ClassificationBadge classification={source.classification} compact />
                ) : null}
                <Chip>{source.status}</Chip>
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[0.625rem] text-water-300 underline decoration-dotted hover:text-water-200"
                  >
                    source ↗
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {preview.limitations.length ? (
        <div className="panel p-4">
          <p className="flex items-center gap-1.5 label-caps">
            <Info className="h-3.5 w-3.5 text-ink-400" aria-hidden />
            Limitations
          </p>
          <ul className="mt-2 space-y-1">
            {preview.limitations.map((limitation, index) => (
              <li
                key={`${limitation}-${index}`}
                className="text-[0.6875rem] leading-relaxed text-ink-400"
              >
                • {limitation}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[0.625rem] text-ink-500">
            Generated {formatDateTime(preview.generated_at)} · report {preview.report_id}
          </p>
        </div>
      ) : null}
    </div>
  );
}
