"use client";

/**
 * Map workspace UI state.
 *
 * Everything here is interface state for the map surface — which basemap is
 * shown, whether the imagery view or place labels are on, the queued camera
 * command, the in-progress drawn area, and the user's own annotation metadata
 * for a saved investigation. None of it is a measurement: the annotation fields
 * (category, group, colour, type) are labels the user typed, kept in this
 * browser only, and labelled as such wherever they appear.
 *
 * It is separate from `lib/workspace.tsx`, which owns provider data, so the
 * tested data path is not disturbed by interface concerns.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type BasemapId = "liberty" | "bright" | "positron" | "dark";
export type MapViewMode = "map" | "imagery";

/** A camera action queued by the toolbar and consumed by the map. */
export type MapCommandType = "zoom-in" | "zoom-out" | "reset-north" | "locate";

export interface MapCommand {
  /** Monotonic id so the same command can be re-issued. */
  id: number;
  type: MapCommandType;
}

/** Categories a user may assign to an investigation. User-authored labels only. */
export const INVESTIGATION_CATEGORIES = [
  "River basin",
  "Lake or reservoir",
  "Coastal zone",
  "Urban water",
  "Agricultural area",
  "Wetland",
  "Catchment study",
  "Other",
] as const;

export const INVESTIGATION_GROUPS = [
  "Unassigned",
  "Monitoring",
  "Research",
  "Reporting",
  "Operations",
] as const;

/** Annotation colours, chosen to read clearly on both blue map and dark panel. */
export const INVESTIGATION_COLORS = [
  { id: "amber", label: "Boundary amber", hex: "#e3b341" },
  { id: "cyan", label: "Water cyan", hex: "#45b6e8" },
  { id: "teal", label: "Aquifer teal", hex: "#38d0a6" },
  { id: "violet", label: "Deep violet", hex: "#a78bfa" },
  { id: "rose", label: "Alert rose", hex: "#f2708a" },
  { id: "ice", label: "Ice white", hex: "#eaf5fa" },
] as const;

export const DEFAULT_ANNOTATION_COLOR = INVESTIGATION_COLORS[0].hex;
export const DEFAULT_ANNOTATION_GROUP = INVESTIGATION_GROUPS[0];

/** Resolve an annotation colour to a hex value, falling back to the default. */
export function annotationColorHex(color: string | undefined): string {
  if (color && /^#[0-9a-f]{3,8}$/i.test(color)) return color;
  return DEFAULT_ANNOTATION_COLOR;
}

export interface InvestigationAnnotation {
  /** "Point" or "Area" — mirrors how the selection was made. */
  type: string;
  category: string;
  group: string;
  color: string;
}

export const DEFAULT_ANNOTATION: InvestigationAnnotation = {
  type: "Point",
  category: "River basin",
  group: DEFAULT_ANNOTATION_GROUP,
  color: DEFAULT_ANNOTATION_COLOR,
};

const STORAGE_KEY = "aquanexus.annotations.v1";

type AnnotationMap = Record<string, InvestigationAnnotation>;

function readAnnotations(): AnnotationMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: AnnotationMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const record = value as Partial<InvestigationAnnotation>;
      out[key] = {
        type: typeof record.type === "string" ? record.type : DEFAULT_ANNOTATION.type,
        category:
          typeof record.category === "string" ? record.category : DEFAULT_ANNOTATION.category,
        group: typeof record.group === "string" ? record.group : DEFAULT_ANNOTATION.group,
        color: typeof record.color === "string" ? record.color : DEFAULT_ANNOTATION.color,
      };
    }
    return out;
  } catch {
    return {};
  }
}

interface MapUiValue {
  basemap: BasemapId;
  setBasemap: (id: BasemapId) => void;
  viewMode: MapViewMode;
  setViewMode: (mode: MapViewMode) => void;
  labelsVisible: boolean;
  toggleLabels: () => void;
  /** True while a geolocation lookup is in flight, so the control can react. */
  locating: boolean;
  setLocating: (value: boolean) => void;
  /** The queued camera command, or null when idle. */
  command: MapCommand | null;
  sendCommand: (type: MapCommandType) => void;
  clearCommand: () => void;

  drawing: boolean;
  startDrawing: () => void;
  stopDrawing: () => void;
  /** Vertices placed so far, as [lon, lat] pairs. */
  drawVertices: number[][];
  addDrawVertex: (lng: number, lat: number) => void;
  removeLastDrawVertex: () => void;
  clearDrawVertices: () => void;

  annotations: AnnotationMap;
  annotationFor: (id: string) => InvestigationAnnotation;
  setAnnotation: (id: string, annotation: InvestigationAnnotation) => void;
  removeAnnotation: (id: string) => void;
}

const MapUiContext = createContext<MapUiValue | null>(null);

/**
 * Read-only fallback used when a component is rendered outside the provider
 * (an isolated unit render, for example). Interface state simply does not
 * change, which keeps such renders deterministic instead of throwing.
 */
const FALLBACK: MapUiValue = Object.freeze({
  basemap: "liberty",
  setBasemap: () => {},
  viewMode: "map",
  setViewMode: () => {},
  labelsVisible: true,
  toggleLabels: () => {},
  locating: false,
  setLocating: () => {},
  command: null,
  sendCommand: () => {},
  clearCommand: () => {},
  drawing: false,
  startDrawing: () => {},
  stopDrawing: () => {},
  drawVertices: [],
  addDrawVertex: () => {},
  removeLastDrawVertex: () => {},
  clearDrawVertices: () => {},
  annotations: {},
  annotationFor: () => DEFAULT_ANNOTATION,
  setAnnotation: () => {},
  removeAnnotation: () => {},
}) satisfies MapUiValue;

export function MapUiProvider({ children }: { children: ReactNode }) {
  const [basemap, setBasemapState] = useState<BasemapId>("liberty");
  const [viewMode, setViewModeState] = useState<MapViewMode>("map");
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [locating, setLocating] = useState(false);
  const [command, setCommand] = useState<MapCommand | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawVertices, setDrawVertices] = useState<number[][]>([]);
  const [annotations, setAnnotations] = useState<AnnotationMap>({});

  // Annotations live in the browser only; read after mount so the server and
  // first client render agree.
  useEffect(() => {
    setAnnotations(readAnnotations());
  }, []);

  const persist = useCallback((next: AnnotationMap) => {
    setAnnotations(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage may be unavailable; the in-memory value still applies */
    }
  }, []);

  const setBasemap = useCallback((id: BasemapId) => setBasemapState(id), []);

  const setViewMode = useCallback((mode: MapViewMode) => {
    setViewModeState(mode);
    // The imagery view is a real NASA GIBS observation layer, not a repainted
    // basemap; place labels are hidden so they cannot be confused for imagery.
    setLabelsVisible(mode !== "imagery");
  }, []);

  const toggleLabels = useCallback(() => setLabelsVisible((value) => !value), []);

  const sendCommand = useCallback((type: MapCommandType) => {
    setCommand((prev) => ({ id: (prev?.id ?? 0) + 1, type }));
  }, []);
  const clearCommand = useCallback(() => setCommand(null), []);

  const startDrawing = useCallback(() => {
    setDrawing(true);
    setDrawVertices([]);
  }, []);
  const stopDrawing = useCallback(() => {
    setDrawing(false);
    setDrawVertices([]);
  }, []);
  const addDrawVertex = useCallback((lng: number, lat: number) => {
    setDrawVertices((prev) => [...prev, [lng, lat]]);
  }, []);
  const removeLastDrawVertex = useCallback(() => {
    setDrawVertices((prev) => prev.slice(0, -1));
  }, []);
  const clearDrawVertices = useCallback(() => setDrawVertices([]), []);

  const annotationFor = useCallback(
    (id: string): InvestigationAnnotation => annotations[id] ?? DEFAULT_ANNOTATION,
    [annotations],
  );

  const setAnnotation = useCallback(
    (id: string, annotation: InvestigationAnnotation) => {
      persist({ ...annotations, [id]: annotation });
    },
    [annotations, persist],
  );

  const removeAnnotation = useCallback(
    (id: string) => {
      const next = { ...annotations };
      delete next[id];
      persist(next);
    },
    [annotations, persist],
  );

  const value = useMemo<MapUiValue>(
    () => ({
      basemap,
      setBasemap,
      viewMode,
      setViewMode,
      labelsVisible,
      toggleLabels,
      locating,
      setLocating,
      command,
      sendCommand,
      clearCommand,
      drawing,
      startDrawing,
      stopDrawing,
      drawVertices,
      addDrawVertex,
      removeLastDrawVertex,
      clearDrawVertices,
      annotations,
      annotationFor,
      setAnnotation,
      removeAnnotation,
    }),
    [
      basemap,
      setBasemap,
      viewMode,
      setViewMode,
      labelsVisible,
      toggleLabels,
      locating,
      setLocating,
      command,
      sendCommand,
      clearCommand,
      drawing,
      startDrawing,
      stopDrawing,
      drawVertices,
      addDrawVertex,
      removeLastDrawVertex,
      clearDrawVertices,
      annotations,
      annotationFor,
      setAnnotation,
      removeAnnotation,
    ],
  );

  return <MapUiContext.Provider value={value}>{children}</MapUiContext.Provider>;
}

export function useMapUi(): MapUiValue {
  const ctx = useContext(MapUiContext);
  return ctx ?? FALLBACK;
}
