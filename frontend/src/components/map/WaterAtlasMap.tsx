"use client";

/**
 * Global water atlas map.
 *
 * MapLibre GL JS v4 with a key-free OpenFreeMap vector style, defaulting to the
 * low-light navy "Ocean" basemap so the workspace stays on one dark surface.
 * Clicking the map selects a coordinate; a marker shows the
 * active location; satellite scene footprints render only when the satellite
 * layer is enabled and real scene metadata has loaded. Nothing decorative is
 * drawn: every overlay is tied to state, and no map style or layer invents
 * imagery or water data.
 *
 * 2D by design: this is the last known-good implementation — MapLibre GL JS v4
 * with the default Mercator projection. A later change moved to MapLibre v5 and a
 * globe projection, but the globe render path needs a WebGL2 context that is not
 * available in every session, so the map failed to initialise there. Rendering the
 * flat map keeps zoom, pan, click-to-select and layer controls working everywhere.
 * WebGL is still required to draw the map, so the fallback below remains.
 *
 * WebGL safety: MapLibre hard-requires a WebGL context. When the browser session
 * cannot provide one (e.g. `GL_VENDOR = Disabled`), constructing the map throws
 * and would otherwise take the whole page down. This component probes support
 * first, guards the constructor, and — if the map engine still fails — swaps in
 * an explicit, accessible fallback so the rest of the workspace stays usable.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw, X } from "lucide-react";
import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
  type StyleSpecification,
} from "maplibre-gl";

import { cn } from "@/lib/utils";
import { useWorkspace, type SelectedLocation, type SelectionMode } from "@/lib/workspace";
import { useMapUi, type BasemapId } from "@/lib/map-ui";
import { useStudyAreas } from "@/lib/study-areas";
import type { StacItem } from "@/lib/schemas";
import { detectWebGLSupport } from "@/lib/webgl";
import { RasterMap, type RasterOverlay } from "@/components/map/RasterMap";
import { AQUA_OCEAN_STYLE } from "@/components/map/aquaBasemapStyle";
import { MapToolbar } from "@/components/map/MapToolbar";
import { MapStatusBar } from "@/components/map/MapStatusBar";
import { LayerControls } from "@/components/panels/LayerControls";

import "maplibre-gl/dist/maplibre-gl.css";

// Key-free OpenFreeMap vector styles. "Dark" is the default: a low-light navy
// canvas keeps the map inside the workspace's dark surface language and lets
// the amber drawn-area stroke and the cyan accent stay legible. The lighter
// styles remain available for reading overlays and street detail.
const BASEMAPS = [
  { id: "dark", label: "Ocean", description: "Deep-ocean canvas tinted to the app palette", style: AQUA_OCEAN_STYLE },
  { id: "liberty", label: "Terrain", description: "Natural-colour land, water and place names", style: "https://tiles.openfreemap.org/styles/liberty" },
  { id: "bright", label: "Bright", description: "High-contrast streets and labels", style: "https://tiles.openfreemap.org/styles/bright" },
  { id: "positron", label: "Light", description: "Pale canvas for reading overlays", style: "https://tiles.openfreemap.org/styles/positron" },
] as const satisfies readonly {
  id: BasemapId;
  label: string;
  description: string;
  style: StyleSpecification | string;
}[];
const DEFAULT_STYLE = BASEMAPS[0].style;

/** Escape contributor-supplied names before they reach the popup's innerHTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
const SCENES_SOURCE = "aquanexus-scenes";
const SCENES_FILL = "aquanexus-scenes-fill";
// Global raster overlay (NASA GIBS). Kept as a single source/layer pair so a
// layer switch is a clean remove-then-add rather than an accumulating stack.
const RASTER_SOURCE = "aquanexus-raster";
const RASTER_LAYER = "aquanexus-raster-layer";
// Mapped water-feature polygons (OpenStreetMap).
const WATER_SOURCE = "aquanexus-water";
const WATER_FILL = "aquanexus-water-fill";
const WATER_LINE = "aquanexus-water-line";
// The committed selection area. Deliberately distinct from the satellite
// footprint styling so a drawn area can never be mistaken for scene metadata.
const SELECTION_SOURCE = "aquanexus-selection";
const SELECTION_FILL = "aquanexus-selection-fill";
const SELECTION_LINE = "aquanexus-selection-line";
// The live rectangle shown while the user is dragging out an area.
const DRAFT_SOURCE = "aquanexus-draft";
const DRAFT_FILL = "aquanexus-draft-fill";
const DRAFT_LINE = "aquanexus-draft-line";
// The polygon being placed point-by-point with the draw tool.
const DRAW_SOURCE = "aquanexus-draw";
const DRAW_FILL = "aquanexus-draw-fill";
const DRAW_LINE = "aquanexus-draw-line";
const DRAW_POINTS = "aquanexus-draw-points";
// The imagery-view overlay: a real NASA GIBS observation layer drawn over the
// basemap when the toolbar is switched to the imagery view.
const VIEW_SOURCE = "aquanexus-view";
const VIEW_LAYER = "aquanexus-view-layer";
const IMAGERY_LAYER_ID = "modis_true_color";

// Satellite footprints are a dashed, muted grey so they read as reference
// metadata rather than an active selection (which is solid cyan).
const SCENE_LINE_COLOR = "#9fb0c4";
// The selection uses the water accent: unmistakably "this is your area".
const SELECTION_COLOR = "#63d8f3";
// Drawn-area boundaries use a warm amber/gold so they stay legible against
// blue satellite imagery and cannot be confused with the cyan accent.
const BOUNDARY_COLOR = "#e3b341";

// Camera bounds. Zoom-out never restricts navigation: the whole world stays
// reachable and the camera never locks to a region.
const GLOBAL_CENTER: [number, number] = [20, 15];
const GLOBAL_ZOOM = 1.6;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 14;
const FOCUS_ZOOM = 4;

type MapStatus =
  | { kind: "pending" }
  | { kind: "ready" }
  | { kind: "unsupported"; message: string };

const GENERIC_UNAVAILABLE =
  "The map engine could not start because WebGL is unavailable in this browser session.";

/** True for errors that indicate the graphics context, not a tile/style hiccup. */
function isWebGLFailure(message: string): boolean {
  return /webgl|graphics|gpu|context/i.test(message);
}

/**
 * Build a closed rectangle ring (as [lon, lat] pairs) from two opposite corners.
 *
 * A rectangle is the clearest possible "area" gesture for a mouse, and it maps
 * to a simple, predictable polygon. Coordinates are clamped to valid ranges so
 * a drag that runs past the antimeridian or a pole cannot produce an invalid
 * ring; the backend validates the result regardless.
 */
function rectRing(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
): number[][] {
  const clampLng = (v: number) => Math.max(-180, Math.min(180, v));
  const clampLat = (v: number) => Math.max(-90, Math.min(90, v));
  const west = clampLng(Math.min(lng1, lng2));
  const east = clampLng(Math.max(lng1, lng2));
  const south = clampLat(Math.min(lat1, lat2));
  const north = clampLat(Math.max(lat1, lat2));
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}

/** True when a ring encloses a non-trivial area (not a click or a hair-line drag). */
function ringHasArea(ring: number[][]): boolean {
  const lons = ring.map((c) => c[0] ?? 0);
  const lats = ring.map((c) => c[1] ?? 0);
  const spanLon = Math.max(...lons) - Math.min(...lons);
  const spanLat = Math.max(...lats) - Math.min(...lats);
  // ~0.005 deg is about 500 m; below that the "drag" was effectively a click.
  return spanLon >= 0.005 && spanLat >= 0.005;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error) return error;
  return GENERIC_UNAVAILABLE;
}

/**
 * Non-WebGL fallback map.
 *
 * When the GL engine cannot start we swap in a real interactive raster map
 * (`RasterMap`) instead of a static picture, so pan, zoom, click-to-select and
 * the selected marker keep working. A compact banner explains why the GL map is
 * unavailable and offers a retry; the map itself stays the working surface.
 */
function MapFallback({
  message,
  location,
  onRetry,
  onSelect,
  scenes,
  showScenes,
  overlay,
  panelOpen,
}: {
  message: string;
  location: SelectedLocation | null;
  onRetry: () => void;
  onSelect: (latitude: number, longitude: number) => void;
  scenes: StacItem[];
  showScenes: boolean;
  overlay?: RasterOverlay | null;
  panelOpen: boolean;
}) {
  return (
    <div className="absolute inset-0 z-20 overflow-hidden bg-abyss-950">
      <RasterMap
        location={location}
        onSelect={onSelect}
        scenes={scenes}
        showScenes={showScenes}
        overlay={overlay}
        ariaLabel="Interactive map (lightweight renderer)"
      />
      {/* The banner would otherwise sit under the layer panel; step it right
          while the panel is open so both stay readable. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3 transition-[padding] duration-200",
          panelOpen && "sm:pl-[16rem]",
        )}
      >
        <div
          role="alert"
          className="pointer-events-auto w-full max-w-xl rounded-xl border border-white/10 bg-abyss-900/95 p-4 shadow-float backdrop-blur animate-fade-in"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-signal-caution/30 bg-signal-caution/10 text-signal-caution">
              <AlertTriangle className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-ink-100">Interactive map unavailable</h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-300">
                This browser session cannot create a WebGL context, so the primary map
                engine is disabled. A lightweight renderer is active below: pan, zoom and
                click-to-select still work.
              </p>
              <p className="mt-2 flex items-start gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-left text-2xs leading-relaxed text-ink-400">
                <AlertTriangle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal-caution"
                  aria-hidden
                />
                <span>{message}</span>
              </p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-ink-100 transition hover:border-water-300/40 hover:bg-water-300/10"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Retry map engine
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WaterAtlasMap() {
  const {
    location,
    layers,
    scenes,
    waterBodies,
    selectLocation,
    mapLayers,
    activeRasterLayerId,
    rasterLayerDate,
    rasterOpacity,
    refreshMapLayers,
    selectionMode,
    setSelectionMode,
    selectDrawnArea,
    clearLocation,
  } = useWorkspace();
  const {
    basemap,
    setBasemap,
    viewMode,
    setViewMode,
    labelsVisible,
    toggleLabels,
    command,
    clearCommand,
    sendCommand,
    drawing,
    startDrawing,
    stopDrawing,
    drawVertices,
    addDrawVertex,
    removeLastDrawVertex,
    clearDrawVertices,
  } = useMapUi();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  // Guards the "map engine failed" transition so a stream of error events cannot
  // flip us back and forth or re-render in a loop.
  const failedRef = useRef(false);
  const [status, setStatus] = useState<MapStatus>({ kind: "pending" });
  // Bumping this re-runs initialisation for the explicit retry action only.
  const [attempt, setAttempt] = useState(0);
  // Bumped whenever the basemap style finishes (re)loading. Overlay effects
  // depend on it so they re-apply their data after a `setStyle` wipe.
  const [styleEpoch, setStyleEpoch] = useState(0);
  const appliedBasemapRef = useRef<BasemapId>(BASEMAPS[0].id);
  // The layers panel floats over the map and starts closed so the map stays
  // unobstructed; the status bar steps aside while it is open rather than
  // being covered by it.
  const [layersOpen, setLayersOpen] = useState(false);
  // Bumped when the style is replaced so the place-label layer can be restored.
  const [northResetAt, setNorthResetAt] = useState(0);
  // Saved investigation count, for the status bar.
  const { areas } = useStudyAreas();
  // Drag-to-draw state. Kept in refs because the map's mouse handlers run
  // outside React's render cycle; only the final ring is pushed into state.
  const drawStartRef = useRef<{ lng: number; lat: number } | null>(null);
  const [drawStart, setDrawStart] = useState(false);
  // The ring currently being dragged, in [lon, lat] pairs, for live feedback.
  const [draftRing, setDraftRing] = useState<number[][] | null>(null);
  // Set when a drawn area is rejected so the reason can be shown on the map.
  const [drawError, setDrawError] = useState<string | null>(null);
  // Mirrors the active tool into a ref so the map's event handlers (bound once)
  // always see the current mode without being re-registered.
  const modeRef = useRef<SelectionMode>(selectionMode);
  useEffect(() => {
    modeRef.current = selectionMode;
  }, [selectionMode]);
  // The drawn vertices live in the UI store but the map's click handler is
  // bound once, so mirror the vertex list and the drawing flag into refs.
  const drawingRef = useRef(drawing);
  const drawVerticesRef = useRef<number[][]>(drawVertices);
  useEffect(() => {
    drawingRef.current = drawing;
  }, [drawing]);
  useEffect(() => {
    drawVerticesRef.current = drawVertices;
  }, [drawVertices]);
  // Bridges the map's mouse handlers back into React state.
  const commitDrawRef = useRef<(ring: number[][]) => void>(() => {});

  // The global layer catalog is needed to build the raster overlay, and the map
  // is the surface the overlay is drawn on, so the map loads it if the layer
  // panel has not already done so.
  useEffect(() => {
    if (!mapLayers.data && !mapLayers.loading && !mapLayers.error) {
      refreshMapLayers();
    }
  }, [mapLayers.data, mapLayers.loading, mapLayers.error, refreshMapLayers]);

  const retry = useCallback(() => {
    failedRef.current = false;
    setStatus({ kind: "pending" });
    setAttempt((n) => n + 1);
  }, []);

  // Initialise the map once, in the default 2D projection.
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    failedRef.current = false;

    // Cheap pre-flight probe: if the session has no WebGL at all, do not even
    // risk the constructor throwing on the render path.
    const support = detectWebGLSupport();
    if (!support.supported) {
      setStatus({ kind: "unsupported", message: support.reason ?? GENERIC_UNAVAILABLE });
      return;
    }

    setStatus({ kind: "pending" });

    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: BASEMAPS.find((b) => b.id === appliedBasemapRef.current)?.style ?? DEFAULT_STYLE,
        center: GLOBAL_CENTER,
        zoom: GLOBAL_ZOOM,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        attributionControl: { compact: true },
      });
    } catch (error) {
      // A synchronous constructor throw (e.g. "Failed to initialize WebGL")
      // must not propagate and unmount the page.
      setStatus({ kind: "unsupported", message: describeError(error) });
      return;
    }
    mapRef.current = map;

    let removed = false;
    let resizeObserver: ResizeObserver | null = null;
    let onLoad: (() => void) | null = null;
    let onStyleLoad: (() => void) | null = null;
    let onClick: ((event: { lngLat: { lat: number; lng: number } }) => void) | null = null;
    let onMouseDown: ((event: { lngLat: { lat: number; lng: number } }) => void) | null = null;
    let onMouseMove: ((event: { lngLat: { lat: number; lng: number } }) => void) | null = null;
    let onMouseUp: ((event: { lngLat: { lat: number; lng: number } }) => void) | null = null;

    // Fully tear down the instance exactly once, tolerating a half-initialised
    // map (partial DOM / context) without throwing.
    const teardown = () => {
      if (removed) return;
      removed = true;
      resizeObserver?.disconnect();
      if (onLoad) map.off("load", onLoad);
      if (onStyleLoad) map.off("style.load", onStyleLoad);
      if (onClick) map.off("click", onClick);
      if (onMouseDown) map.off("mousedown", onMouseDown);
      if (onMouseMove) map.off("mousemove", onMouseMove);
      if (onMouseUp) map.off("mouseup", onMouseUp);
      drawStartRef.current = null;
      try {
        markerRef.current?.remove();
      } catch {
        /* marker may already be detached with the map */
      }
      markerRef.current = null;
      try {
        map.remove();
      } catch {
        /* map may be partially constructed; nothing left to release */
      }
      mapRef.current = null;
    };

    const failToFallback = (error: unknown) => {
      if (failedRef.current) return;
      failedRef.current = true;
      teardown();
      setStatus({ kind: "unsupported", message: describeError(error) });
    };

    map.on("error", (e) => {
      // Surface style/tile failures instead of failing silently. Only a genuine
      // graphics failure (confirmed by a fresh probe) drops us into fallback.
      const raw = e?.error;
      const message = raw instanceof Error ? raw.message : String(raw ?? e);
      console.error("[AquaNexus map]", message);
      if (isWebGLFailure(message) && !detectWebGLSupport().supported) {
        failToFallback(message);
      }
    });

    // MapLibre sizes from the container's box on load, so keep it in sync when
    // the surrounding grid/rails change size (window resize alone is not enough).
    resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    // The zoom and compass controls live in the left toolbar, so the default
    // NavigationControl is not added; the scale bar stays as map chrome.
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    onClick = (event) => {
      const { lat, lng } = event.lngLat;
      // Vertex drawing owns the click entirely while it is armed.
      if (drawingRef.current) {
        addDrawVertex(Number(lng.toFixed(5)), Number(lat.toFixed(5)));
        return;
      }
      // The legacy drag-rectangle tool must not also drop a point marker.
      if (modeRef.current === "draw") return;
      selectLocation({
        latitude: Number(lat.toFixed(5)),
        longitude: Number(lng.toFixed(5)),
        label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        place: null,
        mode: "point",
      });
    };
    map.on("click", onClick);

    // --- Draw-an-area interactions -------------------------------------------
    // Dragging out a rectangle is the least error-prone way to select an area
    // with a mouse, and it produces an unambiguous ring. The rectangle is only
    // committed on mouse-up and only when it encloses a real area; a plain
    // click in draw mode therefore does nothing rather than selecting a
    // degenerate zero-area shape.
    onMouseDown = (event) => {
      if (drawingRef.current || modeRef.current !== "draw") return;
      drawStartRef.current = { lng: event.lngLat.lng, lat: event.lngLat.lat };
      setDrawStart(true);
      map.dragPan.disable();
    };

    onMouseMove = (event) => {
      const start = drawStartRef.current;
      if (!start) return;
      const ring = rectRing(start.lng, start.lat, event.lngLat.lng, event.lngLat.lat);
      setDraftRing(ring);
    };

    onMouseUp = (event) => {
      const start = drawStartRef.current;
      drawStartRef.current = null;
      setDrawStart(false);
      map.dragPan.enable();
      if (!start) return;
      setDraftRing(null);
      const ring = rectRing(start.lng, start.lat, event.lngLat.lng, event.lngLat.lat);
      commitDrawRef.current(ring);
    };

    map.on("mousedown", onMouseDown);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", onMouseUp);

    // Every source and layer AquaNexus owns is registered here. It runs on the
    // first load and again after a basemap switch, because `setStyle` discards
    // all non-basemap sources and layers.
    const addOverlays = () => {
      if (!map.getSource(SCENES_SOURCE)) {
        map.addSource(SCENES_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer(SCENES_FILL)) {
        // Satellite footprints: dashed, muted grey. They are reference metadata
        // about scene coverage, NOT a selection, so they must not use the
        // selection accent colour.
        map.addLayer({
          id: SCENES_FILL,
          type: "line",
          source: SCENES_SOURCE,
          paint: {
            "line-color": SCENE_LINE_COLOR,
            "line-width": 1.2,
            "line-opacity": 0.7,
            "line-dasharray": [2, 2],
          },
          layout: { visibility: "none" },
        });
      }
      if (!map.getSource(WATER_SOURCE)) {
        map.addSource(WATER_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: WATER_FILL,
          type: "fill",
          source: WATER_SOURCE,
          paint: { "fill-color": "#2cc0e4", "fill-opacity": 0.16 },
          layout: { visibility: "none" },
        });
        map.addLayer({
          id: WATER_LINE,
          type: "line",
          source: WATER_SOURCE,
          paint: { "line-color": "#63d8f3", "line-width": 1.3, "line-opacity": 0.9 },
          layout: { visibility: "none" },
        });
      }
      if (!map.getSource(SELECTION_SOURCE)) {
        map.addSource(SELECTION_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: SELECTION_FILL,
          type: "fill",
          source: SELECTION_SOURCE,
          paint: { "fill-color": SELECTION_COLOR, "fill-opacity": 0.12 },
        });
        map.addLayer({
          id: SELECTION_LINE,
          type: "line",
          source: SELECTION_SOURCE,
          paint: { "line-color": SELECTION_COLOR, "line-width": 2, "line-opacity": 0.95 },
        });
      }
      if (!map.getSource(DRAFT_SOURCE)) {
        map.addSource(DRAFT_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: DRAFT_FILL,
          type: "fill",
          source: DRAFT_SOURCE,
          paint: { "fill-color": SELECTION_COLOR, "fill-opacity": 0.1 },
        });
        map.addLayer({
          id: DRAFT_LINE,
          type: "line",
          source: DRAFT_SOURCE,
          paint: {
            "line-color": SELECTION_COLOR,
            "line-width": 1.6,
            "line-opacity": 0.9,
            "line-dasharray": [3, 2],
          },
        });
      }
      // The polygon the user is placing point-by-point. Drawn in the warm
      // boundary amber so it reads as "area I am drawing", never as a
      // provider layer or the cyan selection accent.
      if (!map.getSource(DRAW_SOURCE)) {
        map.addSource(DRAW_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: DRAW_FILL,
          type: "fill",
          source: DRAW_SOURCE,
          filter: ["==", "$type", "Polygon"],
          paint: { "fill-color": BOUNDARY_COLOR, "fill-opacity": 0.14 },
        });
        map.addLayer({
          id: DRAW_LINE,
          type: "line",
          source: DRAW_SOURCE,
          filter: ["==", "$type", "Polygon"],
          paint: {
            "line-color": BOUNDARY_COLOR,
            "line-width": 2,
            "line-opacity": 0.95,
            "line-dasharray": [4, 2],
          },
        });
        map.addLayer({
          id: DRAW_POINTS,
          type: "circle",
          source: DRAW_SOURCE,
          filter: ["==", "$type", "Point"],
          paint: {
            "circle-radius": 4,
            "circle-color": BOUNDARY_COLOR,
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#04101f",
          },
        });
      }
    };

    onLoad = () => {
      addOverlays();
      if (!failedRef.current) setStatus({ kind: "ready" });
    };
    map.on("load", onLoad);

    // A basemap switch keeps the map instance but drops AquaNexus layers, so
    // they must be re-added. The camera, marker and selection survive because
    // they are restored by their own effects.
    onStyleLoad = () => {
      addOverlays();
      setStyleEpoch((n) => n + 1);
    };
    map.on("style.load", onStyleLoad);

    return teardown;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // Recenter and mark when the selected location changes. The marker respects
  // the "Place markers" layer toggle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!location || !layers.places) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (!markerRef.current) {
      const el = document.createElement("div");
      el.className = "aquanexus-marker";
      el.innerHTML =
        '<span class="aquanexus-marker__ring"></span><span class="aquanexus-marker__dot"></span>';
      markerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([location.longitude, location.latitude])
        .addTo(map);
    } else {
      markerRef.current.setLngLat([location.longitude, location.latitude]);
    }
  }, [location, layers.places, status.kind, styleEpoch]);

  // Recenter on a new selection, independently of marker visibility. Zoom never
  // drops below the current view, so navigating to a place cannot restrict the
  // world or lock the camera to a region.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !location) return;
    map.easeTo({
      center: [location.longitude, location.latitude],
      zoom: Math.max(map.getZoom(), FOCUS_ZOOM),
      duration: 700,
    });
  }, [location, status.kind, styleEpoch]);

  // Commit a finished drag: reject degenerate rectangles locally, otherwise hand
  // the ring to the workspace, which validates it server-side.
  useEffect(() => {
    commitDrawRef.current = (ring: number[][]) => {
      if (!ringHasArea(ring)) {
        setDrawError(
          "Drag to draw a rectangle — a click alone is not an area. Drag across the map to select.",
        );
        return;
      }
      setDrawError(null);
      void selectDrawnArea(ring).then((area) => {
        if (area) {
          // Return to point mode after a successful draw so the map is
          // immediately navigable again.
          setSelectionMode("point");
        } else {
          setDrawError("That area could not be analysed. Adjust the rectangle and try again.");
        }
      });
    };
  }, [selectDrawnArea, setSelectionMode]);

  // Draw the committed selection ring (a drawn area or a place bounding box).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const source = map.getSource(SELECTION_SOURCE) as GeoJSONSource | undefined;
      if (!source) return;
      const ring = location?.ring;
      const features =
        ring && ring.length >= 4
          ? [
              {
                type: "Feature" as const,
                properties: {},
                geometry: { type: "Polygon" as const, coordinates: [ring] },
              },
            ]
          : [];
      source.setData({ type: "FeatureCollection", features });
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [location, status.kind, styleEpoch]);

  // Draw the live draft rectangle while the user is dragging.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const source = map.getSource(DRAFT_SOURCE) as GeoJSONSource | undefined;
      if (!source) return;
      const features =
        draftRing && draftRing.length >= 4
          ? [
              {
                type: "Feature" as const,
                properties: {},
                geometry: { type: "Polygon" as const, coordinates: [draftRing] },
              },
            ]
          : [];
      source.setData({ type: "FeatureCollection", features });
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [draftRing, status.kind]);

  // Render mapped water-feature outlines (OpenStreetMap) when the layer is on.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const source = map.getSource(WATER_SOURCE) as GeoJSONSource | undefined;
      if (!source) return;
      const bodies = layers.water ? waterBodies.data?.bodies ?? [] : [];
      const features = bodies
        .filter((b) => b.coordinates.length >= 4)
        .map((b) => ({
          type: "Feature" as const,
          properties: {
            id: b.id,
            name: b.name ?? "",
            kind: b.kind,
            area_km2: b.area_km2 ?? null,
          },
          geometry: { type: "Polygon" as const, coordinates: [b.coordinates] },
        }));
      source.setData({ type: "FeatureCollection", features });
      const visibility = features.length ? "visible" : "none";
      for (const id of [WATER_FILL, WATER_LINE]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [waterBodies.data, layers.water, status.kind, styleEpoch]);

  // Feature inspection: clicking a mapped water outline opens a small popup with
  // its real attributes. This is additive — the click handler that sets the
  // analysis point still runs, so inspecting a lake never blocks selecting it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onClickFeature = (event: {
      features?: { properties?: Record<string, unknown> }[];
      lngLat: { lat: number; lng: number };
    }) => {
      const props = event.features?.[0]?.properties;
      if (!props) return;
      const name = typeof props.name === "string" && props.name ? props.name : "Unnamed water body";
      const kind = typeof props.kind === "string" ? props.kind : "water";
      const area =
        typeof props.area_km2 === "number" ? `${props.area_km2.toFixed(2)} km²` : "area not mapped";
      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({ closeButton: true, offset: 8 })
        .setLngLat(event.lngLat)
        .setHTML(
          `<div style="font:12px/1.45 system-ui,sans-serif;color:#0b2237">` +
            `<strong>${escapeHtml(name)}</strong><br/>` +
            `${escapeHtml(kind)} · ${escapeHtml(area)}<br/>` +
            `<span style="opacity:.7">Source: OpenStreetMap contributors</span></div>`,
        )
        .addTo(map);
    };

    const enter = () => {
      if (layers.water) map.getCanvas().style.cursor = "pointer";
    };
    const leave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", WATER_FILL, onClickFeature);
    map.on("mouseenter", WATER_FILL, enter);
    map.on("mouseleave", WATER_FILL, leave);

    return () => {
      map.off("click", WATER_FILL, onClickFeature);
      map.off("mouseenter", WATER_FILL, enter);
      map.off("mouseleave", WATER_FILL, leave);
      popupRef.current?.remove();
      popupRef.current = null;
    };
  }, [layers.water, status.kind, styleEpoch]);

  // Crosshair cursor while the draw tool is armed, so the mode is unmistakable.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const canvas = map.getCanvas();
    canvas.style.cursor = selectionMode === "draw" ? "crosshair" : "";
    return () => {
      canvas.style.cursor = "";
    };
  }, [selectionMode, status.kind]);

  // Render satellite scene footprints from real STAC metadata.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const source = map.getSource(SCENES_SOURCE) as GeoJSONSource | undefined;
      if (!source) return;

      const items: StacItem[] = scenes.data?.items ?? [];
      const features = items
        .filter((item): item is StacItem & { bbox: number[] } =>
          Array.isArray(item.bbox) && item.bbox.length === 4,
        )
        .map((item) => {
          const [west, south, east, north] = item.bbox as [number, number, number, number];
          return {
            type: "Feature" as const,
            properties: {
              id: item.id,
              cloud: item.cloud_cover ?? null,
              acquired: item.acquired_at ?? null,
            },
            geometry: {
              type: "Polygon" as const,
              coordinates: [
                [
                  [west, south],
                  [east, south],
                  [east, north],
                  [west, north],
                  [west, south],
                ],
              ],
            },
          };
        });

      source.setData({ type: "FeatureCollection", features });
      if (map.getLayer(SCENES_FILL)) {
        map.setLayoutProperty(
          SCENES_FILL,
          "visibility",
          layers.satellite && features.length ? "visible" : "none",
        );
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [scenes.data, layers.satellite, status.kind, styleEpoch]);

  // Draw the active global raster layer (NASA GIBS) over the basemap.
  //
  // The tile template comes straight from the backend catalog, so the layer,
  // its date and its availability are the ones the backend verified. The tile
  // date segment is rewritten from the current date selection: `default` means
  // "most recent available". When the layer is unavailable or none is selected,
  // any existing overlay is removed rather than left showing stale imagery.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const activeLayer = mapLayers.data?.layers.find(
        (l) => l.id === activeRasterLayerId,
      );
      const template = activeLayer?.available ? activeLayer.tile_template : null;

      // Always clear a previous overlay first so a switch never leaves two
      // rasters stacked or an outdated one visible.
      for (const id of [RASTER_LAYER, RASTER_SOURCE]) {
        if (id === RASTER_LAYER && map.getLayer(id)) map.removeLayer(id);
        if (id === RASTER_SOURCE && map.getSource(id)) map.removeSource(id);
      }

      if (!template || !activeLayer) return;

      const timeSegment = rasterLayerDate ?? "default";
      const url = template.replace("/default/", `/${timeSegment}/`);

      map.addSource(RASTER_SOURCE, {
        type: "raster",
        tiles: [url],
        tileSize: 256,
        maxzoom: activeLayer.max_zoom,
        attribution: activeLayer.attribution,
      });
      map.addLayer({
        id: RASTER_LAYER,
        type: "raster",
        source: RASTER_SOURCE,
        paint: { "raster-opacity": rasterOpacity, "raster-fade-duration": 200 },
      });
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [mapLayers.data, activeRasterLayerId, rasterLayerDate, rasterOpacity, status.kind, styleEpoch]);

  // Switch the basemap style on request. The map instance is reused, so the
  // camera and selection survive; the overlay effects re-apply their data once
  // the new style has loaded (see `styleEpoch`). `appliedBasemapRef` records
  // what the map is actually showing, since the style object does not expose
  // the URL it was created from.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const target = BASEMAPS.find((b) => b.id === basemap);
    if (!target || appliedBasemapRef.current === target.id) return;
    appliedBasemapRef.current = target.id;
    map.setStyle(target.style);
  }, [basemap, status.kind]);

  // Render the polygon the user is placing point by point. A single point is a
  // circle marker; three or more are closed into a ring so the user can see the
  // area that will be validated.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const source = map.getSource(DRAW_SOURCE) as GeoJSONSource | undefined;
      if (!source) return;
      const features: GeoJSON.Feature[] = [];
      if (drawVertices.length >= 3) {
        features.push({
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [[...drawVertices, drawVertices[0]!]],
          },
        });
      } else if (drawVertices.length >= 1) {
        features.push({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: drawVertices },
        });
      }
      for (const vertex of drawVertices) {
        features.push({
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: vertex },
        });
      }
      source.setData({ type: "FeatureCollection", features });
      const visibility = drawVertices.length ? "visible" : "none";
      for (const id of [DRAW_FILL, DRAW_LINE, DRAW_POINTS]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [drawVertices, status.kind, styleEpoch]);

  // Handle camera commands queued by the left toolbar.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !command) return;
    switch (command.type) {
      case "zoom-in":
        map.zoomTo(Math.min(map.getZoom() + 1, MAX_ZOOM), { duration: 220 });
        break;
      case "zoom-out":
        map.zoomTo(Math.max(map.getZoom() - 1, MIN_ZOOM), { duration: 220 });
        break;
      case "reset-north":
        map.easeTo({ bearing: 0, pitch: 0, duration: 320 });
        setNorthResetAt((n) => n + 1);
        break;
      case "locate":
        if (typeof navigator === "undefined" || !navigator.geolocation) break;
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            map.easeTo({ center: [longitude, latitude], zoom: FOCUS_ZOOM, duration: 700 });
          },
          () => {
            /* Denied or unavailable: the map simply stays where it is. */
          },
          { enableHighAccuracy: false, timeout: 8000 },
        );
        break;
    }
    clearCommand();
  }, [command, clearCommand, status.kind]);

  // Imagery view: draw a real NASA GIBS observation layer over the basemap. It
  // is a measured product (satellite estimate), not a repainted basemap, so the
  // label and the layer note say which dataset is shown.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      for (const id of [VIEW_LAYER, VIEW_SOURCE]) {
        if (id === VIEW_LAYER && map.getLayer(id)) map.removeLayer(id);
        if (id === VIEW_SOURCE && map.getSource(id)) map.removeSource(id);
      }
      if (viewMode !== "imagery") return;
      const layer = mapLayers.data?.layers.find((l) => l.id === IMAGERY_LAYER_ID);
      if (!layer?.available || !layer.tile_template) return;
      const url = layer.tile_template.replace("/default/", "/default/");
      map.addSource(VIEW_SOURCE, {
        type: "raster",
        tiles: [url],
        tileSize: 256,
        maxzoom: layer.max_zoom,
        attribution: layer.attribution,
      });
      map.addLayer({
        id: VIEW_LAYER,
        type: "raster",
        source: VIEW_SOURCE,
        paint: { "raster-opacity": 0.85, "raster-fade-duration": 200 },
      });
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [viewMode, mapLayers.data, status.kind, styleEpoch]);

  // Place labels: the map style's own symbol layers. They are switched with the
  // same mechanism the style exposes, so nothing is re-implemented.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const style = map.getStyle();
      if (!style?.layers) return;
      const value = labelsVisible ? "visible" : "none";
      for (const layer of style.layers) {
        if (layer.type !== "symbol") continue;
        try {
          map.setLayoutProperty(layer.id, "visibility", value);
        } catch {
          /* a layer may not support the property; skip it */
        }
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [labelsVisible, status.kind, styleEpoch, northResetAt]);

  // Keyboard shortcuts for the area tool: Enter saves, Escape cancels and
  // Backspace removes the last point. Bound only while the tool is armed so
  // they cannot interfere with the rest of the workspace.
  useEffect(() => {
    if (!drawing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finishDraw();
      } else if (event.key === "Escape") {
        event.preventDefault();
        setDrawError(null);
        stopDrawing();
      } else if (event.key === "Backspace") {
        event.preventDefault();
        removeLastDrawVertex();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const activeRasterLayer = mapLayers.data?.layers.find(
    (l) => l.id === activeRasterLayerId,
  );
  const rasterOverlay: RasterOverlay | null =
    activeRasterLayer?.available && activeRasterLayer.tile_template
      ? {
          id: activeRasterLayer.id,
          name: activeRasterLayer.name,
          // The catalog template carries a `/default/` date segment which is
          // rewritten to the requested date for the fallback renderer too.
          template: activeRasterLayer.tile_template.replace(
            "/default/",
            `/${rasterLayerDate ?? "default"}/`,
          ),
          maxZoom: activeRasterLayer.max_zoom,
          opacity: rasterOpacity,
        }
      : null;

  const sceneCount = scenes.data?.items.length ?? 0;
  const mapUnavailable = status.kind === "unsupported";
  const areaCount = areas.length;
  const imageryLayer = mapLayers.data?.layers.find((l) => l.id === IMAGERY_LAYER_ID);
  const imageryLabel =
    viewMode === "imagery"
      ? (imageryLayer?.name ?? "True-colour imagery")
      : "Off";

  /**
   * Commit the placed boundary points. The ring is handed to the workspace,
   * which validates it server-side exactly as the drag tool does; nothing here
   * fabricates a geometry or an area.
   */
  const finishDraw = useCallback(() => {
    const vertices = drawVerticesRef.current;
    if (vertices.length < 3) {
      setDrawError("Place at least three points before saving the area.");
      return;
    }
    setDrawError(null);
    const ring = [...vertices, vertices[0]!];
    void selectDrawnArea(ring).then((area) => {
      if (area) {
        stopDrawing();
      } else {
        setDrawError("That area could not be analysed. Adjust the boundary and try again.");
      }
    });
  }, [selectDrawnArea, stopDrawing]);

  const showSceneBadge = !mapUnavailable && layers.satellite && sceneCount > 0;
  const showSceneError = !mapUnavailable && layers.satellite && scenes.error && !scenes.loading;
  const showSceneEmpty =
    !mapUnavailable &&
    layers.satellite &&
    !scenes.error &&
    !scenes.loading &&
    scenes.data !== null &&
    sceneCount === 0;

  return (
    <div className="relative h-full w-full">
      {/* The map container must always fill its parent. MapLibre's own stylesheet
          is injected at runtime and sets `.maplibregl-map { position: relative }`
          with the same specificity as Tailwind's `.absolute` but later in the
          cascade, which would override it and collapse the element to zero
          height (inset-0 cannot stretch a relative box). `!absolute` forces the
          override so the map has a non-zero box. It stays mounted (but inert and
          hidden from assistive tech) when the fallback is shown so a retry can
          re-use the same container. */}
      <div
        ref={containerRef}
        className="!absolute inset-0"
        aria-hidden={mapUnavailable}
        aria-label={mapUnavailable ? undefined : "Interactive global map"}
      />
      {mapUnavailable ? (
        <MapFallback
          message={status.message}
          location={location}
          onRetry={retry}
          onSelect={(latitude, longitude) =>
            selectLocation({
              latitude,
              longitude,
              label: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
              place: null,
            })
          }
          scenes={scenes.data?.items ?? []}
          showScenes={layers.satellite}
          overlay={rasterOverlay}
          panelOpen={layersOpen}
        />
      ) : (
        <>
          {/* Vertical toolbar pinned to the left edge. The right edge stays
              clear for the investigation rail and the top centre for the
              Map / Analytics control. */}
          <div className="absolute left-3 top-3 z-20 flex max-h-[calc(100%-1.5rem)] flex-col gap-2">
            <MapToolbar
              basemaps={BASEMAPS}
              basemap={basemap}
              onSelectBasemap={(id) => setBasemap(id as BasemapId)}
              viewMode={viewMode}
              onToggleView={() => setViewMode(viewMode === "imagery" ? "map" : "imagery")}
              onZoomIn={() => sendCommand("zoom-in")}
              onZoomOut={() => sendCommand("zoom-out")}
              drawing={drawing}
              onToggleDraw={() => {
                setDrawError(null);
                if (drawing) {
                  stopDrawing();
                } else {
                  clearDrawVertices();
                  startDrawing();
                }
              }}
              vertexCount={drawVertices.length}
              onFinishDraw={() => {
                if (drawVertices.length < 3) {
                  setDrawError("Place at least three points before saving the area.");
                  return;
                }
                setDrawError(null);
                void selectDrawnArea([...drawVertices, drawVertices[0]!]).then((area) => {
                  stopDrawing();
                  if (!area) {
                    setDrawError(
                      "That area could not be analysed. Adjust the boundary and try again.",
                    );
                  }
                });
              }}
              onCancelDraw={() => {
                setDrawError(null);
                stopDrawing();
              }}
              onLocate={() => sendCommand("locate")}
              locating={false}
              labelsVisible={labelsVisible}
              onToggleLabels={toggleLabels}
              onResetNorth={() => sendCommand("reset-north")}
              layersOpen={layersOpen}
              onToggleLayers={() => setLayersOpen((value) => !value)}
            />

            {layersOpen ? (
              <div
                id="map-layer-panel"
                className="chrome pointer-events-auto max-h-[calc(100%-3rem)] w-60 overflow-y-auto p-3"
              >
                <MapLayerControls onClose={() => setLayersOpen(false)} />
              </div>
            ) : null}
          </div>

          {drawing ? (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-16">
              <div className="max-w-md rounded-lg border border-boundary/45 bg-abyss-900/95 px-3 py-2 text-center shadow-float backdrop-blur">
                <p className="text-xs font-medium text-boundary-soft">
                  {drawVertices.length === 0
                    ? "Click the map to place the first boundary point"
                    : drawVertices.length < 3
                      ? `Place ${3 - drawVertices.length} more point${
                          3 - drawVertices.length === 1 ? "" : "s"
                        } to close the area`
                      : "Press Enter to save this area, or Escape to cancel"}
                </p>
                <p className="mt-0.5 text-2xs text-ink-300">
                  Backspace removes the last point. The backend validates the boundary.
                </p>
              </div>
            </div>
          ) : null}

          {selectionMode === "draw" ? (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-16">
              <div className="max-w-md rounded-lg border border-water-300/45 bg-abyss-900/95 px-3 py-2 text-center shadow-float backdrop-blur">
                <p className="text-xs font-medium text-water-200">
                  {drawStart ? "Release to select this area" : "Drag on the map to draw a rectangle"}
                </p>
                <p className="mt-0.5 text-2xs text-ink-300">
                  The analysis runs at the centre of the area you draw.
                </p>
              </div>
            </div>
          ) : null}

          {drawError ? (
            <div
              role="status"
              className="absolute inset-x-0 top-20 z-10 flex justify-center px-4"
            >
              <p className="max-w-md rounded-lg border border-signal-caution/40 bg-abyss-900/95 px-3 py-2 text-center text-xs text-signal-caution shadow-float backdrop-blur">
                {drawError}
              </p>
            </div>
          ) : null}

          {location?.area ? (
            <div className="pointer-events-none absolute bottom-14 right-3 z-10 max-w-xs rounded-lg border border-boundary/40 bg-abyss-900/90 px-3 py-2 backdrop-blur">
              <p className="text-2xs font-semibold uppercase tracking-wide text-boundary-soft">
                Selected area
              </p>
              <p className="mt-0.5 text-xs text-ink-300">
                {location.area.area_km2
                  ? `${Math.round(location.area.area_km2).toLocaleString()} km² — `
                  : ""}
                analysed at its centre
              </p>
            </div>
          ) : null}

          {showSceneBadge ? (
            <div className="pointer-events-none absolute bottom-14 left-3 z-10 rounded-lg border border-white/10 bg-abyss-900/85 px-3 py-2 backdrop-blur">
              <p className="text-2xs font-semibold uppercase tracking-wide text-ink-300">
                Satellite footprints
              </p>
              <p className="mt-0.5 text-xs text-ink-400">
                {sceneCount} Sentinel scene{sceneCount === 1 ? "" : "s"} — metadata only
              </p>
            </div>
          ) : null}
          {showSceneError ? (
            <div
              role="status"
              className="absolute bottom-14 left-3 z-10 max-w-xs rounded-lg border border-signal-alert/30 bg-abyss-900/90 px-3 py-2 backdrop-blur"
            >
              <p className="text-2xs font-semibold uppercase tracking-wide text-signal-alert">
                Satellite scenes unavailable
              </p>
              <p className="mt-0.5 text-xs text-ink-300">{scenes.error}</p>
            </div>
          ) : null}
          {showSceneEmpty ? (
            <div className="pointer-events-none absolute bottom-14 left-3 z-10 rounded-lg border border-white/10 bg-abyss-900/85 px-3 py-2 backdrop-blur">
              <p className="text-2xs font-semibold uppercase tracking-wide text-ink-300">
                Satellite footprints
              </p>
              <p className="mt-0.5 text-xs text-ink-400">No scenes in this window.</p>
            </div>
          ) : null}

          {/* Bottom status bar. It steps right while the layer panel is open so
              the two never overlap. */}
          <div
            className={cn(
              "pointer-events-none absolute bottom-0 z-20 hidden w-full justify-center p-3 transition-[padding] duration-200 md:flex",
              layersOpen && "md:pl-[17rem]",
            )}
          >
            <MapStatusBar
              className="pointer-events-auto max-w-[52rem]"
              count={areaCount}
              basemapLabel={BASEMAPS.find((b) => b.id === basemap)?.label ?? basemap}
              imageryLabel={imageryLabel}
              selected={location}
            />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The layer panel content. It composes the existing layer toggles (which are
 * wired to real workspace state) with the annotation colour the drawn area
 * uses, so the panel is the single place map layers are controlled.
 */
function MapLayerControls({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="label-caps">Map layers</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-0.5 text-ink-400 transition hover:text-ink-100"
          aria-label="Close layer panel"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <LayerControls embedded />
    </div>
  );
}
