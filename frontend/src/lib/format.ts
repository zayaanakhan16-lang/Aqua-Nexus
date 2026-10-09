/** Shared formatting and classification helpers. */
import type { DataClassification, ProviderStatus } from "./schemas";

export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function formatCoord(value: number, kind: "lat" | "lon"): string {
  const hemisphere =
    kind === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${Math.abs(value).toFixed(4)}° ${hemisphere}`;
}

export interface ClassificationStyle {
  label: string;
  short: string;
  description: string;
  className: string;
  dot: string;
}

export const CLASSIFICATION_STYLES: Record<DataClassification, ClassificationStyle> = {
  observation: {
    label: "Direct observation",
    short: "Observed",
    description: "Measured directly by an instrument or gauge.",
    className: "border-signal-good/40 bg-signal-good/10 text-signal-good",
    dot: "bg-signal-good",
  },
  satellite_estimate: {
    label: "Satellite estimate",
    short: "Satellite",
    description: "Derived from remote sensing; not a point measurement.",
    className: "border-water-300/40 bg-water-300/10 text-water-200",
    dot: "bg-water-300",
  },
  reanalysis: {
    label: "Reanalysis",
    short: "Reanalysis",
    description: "Model reconstruction constrained by observations.",
    className: "border-water-400/40 bg-water-400/10 text-water-300",
    dot: "bg-water-400",
  },
  forecast: {
    label: "Forecast",
    short: "Forecast",
    description: "Modelled prediction of what may occur.",
    className: "border-signal-info/40 bg-signal-info/10 text-signal-info",
    dot: "bg-signal-info",
  },
  derived: {
    label: "AquaNexus derived",
    short: "Derived",
    description: "Computed by AquaNexus from the listed inputs.",
    className: "border-teal-400/40 bg-teal-400/10 text-teal-400",
    dot: "bg-teal-400",
  },
  simulation: {
    label: "Simulation",
    short: "Simulated",
    description: "Scenario or model output, not a measurement.",
    className: "border-signal-caution/40 bg-signal-caution/10 text-signal-caution",
    dot: "bg-signal-caution",
  },
  demonstration: {
    label: "Demonstration",
    short: "Demo",
    description: "Synthetic value shown only to illustrate the interface.",
    className: "border-signal-alert/40 bg-signal-alert/10 text-signal-alert",
    dot: "bg-signal-alert",
  },
};

export const STATUS_STYLES: Record<ProviderStatus, { label: string; className: string }> = {
  ok: { label: "Live", className: "text-signal-good" },
  partial: { label: "Partial", className: "text-signal-caution" },
  unconfigured: { label: "Not configured", className: "text-ink-400" },
  unavailable: { label: "Unavailable", className: "text-signal-alert" },
  error: { label: "Error", className: "text-signal-alert" },
};

export function classificationStyle(c: DataClassification): ClassificationStyle {
  return CLASSIFICATION_STYLES[c];
}

export function indicatorStatusLabel(status: string): {
  label: string;
  className: string;
} {
  switch (status) {
    case "ok":
      return { label: "Available", className: "text-signal-good" };
    case "stale":
      return { label: "Stale", className: "text-signal-caution" };
    case "insufficient_data":
      return { label: "Insufficient data", className: "text-signal-caution" };
    case "unavailable":
      return { label: "Unavailable", className: "text-signal-alert" };
    default:
      return { label: status.replace(/_/g, " "), className: "text-ink-300" };
  }
}
