/**
 * Presentation helpers for the water-intelligence modules.
 *
 * These map the backend's own status vocabulary to a label, an icon tone and a
 * short explanation. They never invent a status: an unknown value falls through
 * to a neutral "reported" label so a new backend status degrades gracefully
 * instead of being silently mislabelled.
 */
import type {
  FloodStatus,
  WaterPresenceStatus,
} from "@/lib/schemas";

export type Tone = "good" | "caution" | "alert" | "info" | "muted";

export interface StatusPresentation {
  label: string;
  tone: Tone;
  /** One-line plain-language meaning, shown next to the status. */
  meaning: string;
}

const PRESENCE: Record<WaterPresenceStatus, StatusPresentation> = {
  water_detected: {
    label: "Water detected",
    tone: "good",
    meaning: "At least one mapped or observed source indicates surface water here.",
  },
  no_water_detected: {
    label: "No water detected",
    tone: "muted",
    meaning: "Usable observations covered this area and none indicated surface water.",
  },
  partial_coverage: {
    label: "Partial coverage",
    tone: "caution",
    meaning: "Some evidence is available, but part of the area was not observed.",
  },
  insufficient_evidence: {
    label: "Insufficient evidence",
    tone: "caution",
    meaning:
      "No usable observation covered this area. This is not evidence that water is absent.",
  },
  unavailable: {
    label: "Sources unavailable",
    tone: "alert",
    meaning: "The water-presence sources could not be reached for this request.",
  },
};

export function presenceStatus(status: WaterPresenceStatus): StatusPresentation {
  return (
    PRESENCE[status] ?? {
      label: status,
      tone: "muted",
      meaning: "The backend reported a status this build does not yet describe.",
    }
  );
}

const FLOOD: Record<FloodStatus, StatusPresentation> = {
  observed_flood_water: {
    label: "Observed flood-related water",
    tone: "alert",
    meaning:
      "An observed water-extent product indicates water beyond its usual mapped extent.",
  },
  heavy_rainfall_signal: {
    label: "Heavy-rainfall signal",
    tone: "caution",
    meaning:
      "Rainfall accumulation was unusually high. Rainfall alone does not prove a flood.",
  },
  elevated_discharge_signal: {
    label: "Elevated modelled discharge",
    tone: "caution",
    meaning:
      "A modelled river-discharge product was above its own reference period.",
  },
  no_flood_evidence: {
    label: "No flood evidence detected",
    tone: "good",
    meaning: "No usable source indicated flood-related water in the checked window.",
  },
  insufficient_data: {
    label: "Insufficient data",
    tone: "muted",
    meaning: "No flood-relevant source returned usable data for this location.",
  },
};

export function floodStatus(status: FloodStatus): StatusPresentation {
  return (
    FLOOD[status] ?? {
      label: status,
      tone: "muted",
      meaning: "The backend reported a flood status this build does not yet describe.",
    }
  );
}

/** Human label for the backend's per-evidence-item status strings. */
export function evidenceItemLabel(status: string): string {
  const map: Record<string, string> = {
    observed: "Observed",
    detected: "Detected",
    elevated: "Elevated",
    normal: "Normal",
    below_normal: "Below normal",
    none: "None",
    unavailable: "Unavailable",
    insufficient: "Insufficient",
  };
  return map[status] ?? status;
}

export function evidenceItemTone(status: string): Tone {
  const map: Record<string, Tone> = {
    observed: "alert",
    detected: "alert",
    elevated: "caution",
    normal: "good",
    below_normal: "info",
    none: "good",
    unavailable: "muted",
    insufficient: "caution",
  };
  return map[status] ?? "muted";
}
