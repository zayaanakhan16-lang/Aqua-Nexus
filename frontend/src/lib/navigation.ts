import {
  Activity,
  CalendarClock,
  CalendarRange,
  CloudRain,
  Droplets,
  FileCheck2,
  FileText,
  Gauge,
  Layers,
  Leaf,
  MapPinned,
  Mountain,
  Satellite,
  ShieldAlert,
  Sparkles,
  Thermometer,
  Waves,
} from "lucide-react";

/**
 * The single source of truth for workspace navigation.
 *
 * AquaNexus follows the AgriSense pattern: a compact horizontal bar of eight
 * primary destinations, each of which reveals its own sections inside the
 * workspace rather than adding a second row of top-level tabs. The grouping is
 * *derived* — a section belongs to exactly one group, so the active primary
 * destination is computed from the active section instead of being stored
 * separately. That keeps deep links (`/explore?tab=flood`) authoritative and
 * means the two levels can never disagree.
 */

/** Every section the intelligence surface can render. */
export type WorkspaceTabId =
  | "overview"
  | "weather"
  | "precipitation"
  | "water-presence"
  | "water-atlas"
  | "water-stress"
  | "flood"
  | "outlook"
  | "change"
  | "discharge"
  | "satellite"
  | "global-layers"
  | "profile"
  | "planning"
  | "ai"
  | "report"
  | "sources";

export interface WorkspaceSection {
  id: WorkspaceTabId;
  label: string;
  icon: typeof Activity;
  /** Sections that read a selected location are blocked until one exists. */
  needsLocation?: boolean;
}

export interface WorkspaceGroup {
  id: string;
  label: string;
  icon: typeof Activity;
  /** One-line purpose, used as the nav link's accessible description. */
  description: string;
  sections: WorkspaceSection[];
}

export const WORKSPACE_GROUPS: WorkspaceGroup[] = [
  {
    id: "overview",
    label: "Overview",
    icon: Gauge,
    description: "Water availability, precipitation, quality and recent activity",
    sections: [{ id: "overview", label: "Overview", icon: Activity, needsLocation: true }],
  },
  {
    id: "water-resources",
    label: "Water Resources",
    icon: Droplets,
    description: "Resource profiles, waterbodies, river discharge and allocation",
    sections: [
      { id: "water-presence", label: "Water Presence", icon: Droplets, needsLocation: true },
      { id: "water-atlas", label: "Water Atlas", icon: Layers, needsLocation: true },
      { id: "discharge", label: "River Discharge", icon: Waves, needsLocation: true },
      { id: "profile", label: "Water Profile", icon: Droplets, needsLocation: true },
    ],
  },
  {
    id: "ecosystems",
    label: "Aquatic Ecosystems",
    icon: Leaf,
    description: "Surface-water extent, change over time and satellite observations",
    sections: [
      { id: "change", label: "Change Detection", icon: CalendarRange, needsLocation: true },
      { id: "satellite", label: "Satellite Explorer", icon: Satellite, needsLocation: true },
    ],
  },
  {
    id: "watersheds",
    label: "Watersheds & Terrain",
    icon: Mountain,
    description: "Basin-scale layers and terrain context",
    sections: [{ id: "global-layers", label: "Global Layers", icon: Layers }],
  },
  {
    id: "climate",
    label: "Weather & Water",
    icon: CloudRain,
    description: "Rainfall, temperature, outlook and water balance",
    sections: [
      { id: "weather", label: "Weather", icon: Thermometer, needsLocation: true },
      { id: "precipitation", label: "Precipitation", icon: CloudRain, needsLocation: true },
      { id: "outlook", label: "Outlook", icon: CalendarClock, needsLocation: true },
    ],
  },
  {
    id: "studio",
    label: "Water Planning Studio",
    icon: MapPinned,
    description: "Spatial allocation of water across zones and scenarios",
    sections: [
      { id: "planning", label: "Water Planning", icon: CalendarRange, needsLocation: true },
    ],
  },
  {
    id: "decision",
    label: "Risks & Decisions",
    icon: ShieldAlert,
    description: "Flood and scarcity risk with transparent decision support",
    sections: [
      { id: "flood", label: "Flood", icon: ShieldAlert, needsLocation: true },
      { id: "water-stress", label: "Water Stress", icon: Waves, needsLocation: true },
      { id: "ai", label: "AI Analysis", icon: Sparkles, needsLocation: true },
    ],
  },
  {
    id: "reports",
    label: "Report",
    icon: FileText,
    description: "Field-ready reporting and the evidence behind every value",
    sections: [
      { id: "report", label: "Report", icon: FileText, needsLocation: true },
      { id: "sources", label: "Sources & Evidence", icon: FileCheck2 },
    ],
  },
];

/** Flat lookup of every section, in navigation order. */
export const WORKSPACE_SECTIONS: WorkspaceSection[] = WORKSPACE_GROUPS.flatMap(
  (group) => group.sections,
);

const SECTION_INDEX = new Map<WorkspaceTabId, { group: WorkspaceGroup; section: WorkspaceSection }>(
  WORKSPACE_GROUPS.flatMap((group) =>
    group.sections.map((section) => [section.id, { group, section }] as const),
  ),
);

/** The group a section belongs to. Every section belongs to exactly one. */
export function groupForTab(tab: WorkspaceTabId): WorkspaceGroup {
  return SECTION_INDEX.get(tab)?.group ?? WORKSPACE_GROUPS[0]!;
}

/** The first section of a group — where its primary nav link lands. */
export function firstSectionOf(group: WorkspaceGroup): WorkspaceSection {
  return group.sections[0]!;
}

/** True when `value` names a real section, for validating URL parameters. */
export function isWorkspaceTabId(value: string | null): value is WorkspaceTabId {
  return value !== null && SECTION_INDEX.has(value as WorkspaceTabId);
}
