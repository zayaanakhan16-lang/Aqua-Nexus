"use client";

/**
 * Global water atlas map.
 *
 * MapLibre GL JS v4 with a key-free OpenFreeMap "Liberty" style: natural-colour
 * oceans, lakes and rivers, green land and parks, visible roads and place names
 * at every zoom level. Clicking the map selects a coordinate; a marker shows the
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
import { AlertTriangle, MapPin, RefreshCw, SquareDashed } from "lucide-react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";

import { cn } from "@/lib/utils";
import { useWorkspace, type SelectedLocation, type SelectionMode } from "@/lib/workspace";
import type { StacItem } from "@/lib/schemas";
import { detectWebGLSupport } from "@/lib/webgl";
import { RasterMap, type RasterOverlay } from "@/components/map/RasterMap";

import "maplibre-gl/dist/maplibre-gl.css";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
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

// Satellite footprints are a dashed, muted grey so they read as reference
// metadata rather than an active selection (which is solid cyan).
const SCENE_LINE_COLOR = "#9fb0c4";
// The selection uses the water accent: unmistakably "this is your area".
const SELECTION_COLOR = "#63d8f3";

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
}: {
  message: string;
  location: SelectedLocation | null;
  onRetry: () => void;
  onSelect: (latitude: number, longitude: number) => void;
  scenes: StacItem[];
  showScenes: boolean;
  overlay?: RasterOverlay | null;
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
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
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
              <p className="mt-2 flex items-start gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-left text-[0.6875rem] leading-relaxed text-ink-400">
                <AlertTriangle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal-caution"
                  aria-hidden
                />
                <span>{message}</span>
              </p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-ink-100 transition hover:border-water-400/40 hover:bg-water-400/10"
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
  } = useWorkspace();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  // Guards the "map engine failed" transition so a stream of error events cannot
  // flip us back and forth or re-render in a loop.
  const failedRef = useRef(false);
  const [status, setStatus] = useState<MapStatus>({ kind: "pending" });
  // Bumping this re-runs initialisation for the explicit retry action only.
  const [attempt, setAttempt] = useState(0);
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
        style: STYLE_URL,
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

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    onClick = (event) => {
      // In draw mode a click starts a drag rectangle, handled by the mouse
      // handlers below; it must not also drop a point marker.
      if (modeRef.current === "draw") return;
      const { lat, lng } = event.lngLat;
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
      if (modeRef.current !== "draw") return;
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

    onLoad = () => {
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
      if (!failedRef.current) setStatus({ kind: "ready" });
    };
    map.on("load", onLoad);

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
  }, [location, layers.places, status.kind]);

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
  }, [location, status.kind]);

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
  }, [location, status.kind]);

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
  }, [waterBodies.data, layers.water, status.kind]);

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
  }, [scenes.data, layers.satellite, status.kind]);

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
  }, [mapLayers.data, activeRasterLayerId, rasterLayerDate, rasterOpacity, status.kind]);

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
        />
      ) : (
        <>
          {/* Selection tools. Two explicit, labelled modes so it is always clear
              whether a click drops a point or starts drawing an area. */}
          <div className="absolute left-3 top-3 z-10 flex flex-col gap-1 rounded-xl border border-white/10 bg-abyss-900/90 p-1.5 shadow-float backdrop-blur">
            <p className="px-1.5 pb-0.5 pt-1 text-[0.625rem] font-semibold uppercase tracking-wide text-ink-400">
              Select area
            </p>
            <button
              type="button"
              aria-pressed={selectionMode === "point"}
              onClick={() => {
                setDrawError(null);
                setSelectionMode("point");
              }}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium transition",
                selectionMode === "point"
                  ? "bg-water-400/15 text-water-100 ring-1 ring-water-400/40"
                  : "text-ink-200 hover:bg-white/[0.06]",
              )}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Point
            </button>
            <button
              type="button"
              aria-pressed={selectionMode === "draw"}
              onClick={() => {
                setDrawError(null);
                setSelectionMode(selectionMode === "draw" ? "point" : "draw");
              }}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium transition",
                selectionMode === "draw"
                  ? "bg-water-400/15 text-water-100 ring-1 ring-water-400/40"
                  : "text-ink-200 hover:bg-white/[0.06]",
              )}
            >
              <SquareDashed className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Draw an area
            </button>
          </div>

          {selectionMode === "draw" ? (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-4">
              <div className="max-w-md rounded-lg border border-water-400/40 bg-abyss-900/95 px-3 py-2 text-center shadow-float backdrop-blur">
                <p className="text-xs font-medium text-water-100">
                  {drawStart ? "Release to select this area" : "Drag on the map to draw a rectangle"}
                </p>
                <p className="mt-0.5 text-[0.6875rem] text-ink-300">
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
            <div className="pointer-events-none absolute bottom-3 right-3 z-10 max-w-xs rounded-lg border border-water-400/30 bg-abyss-900/90 px-3 py-2 backdrop-blur">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-water-200">
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
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg border border-white/10 bg-abyss-900/85 px-3 py-2 backdrop-blur">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-300">
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
              className="absolute bottom-3 left-3 z-10 max-w-xs rounded-lg border border-signal-alert/30 bg-abyss-900/90 px-3 py-2 backdrop-blur"
            >
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-signal-alert">
                Satellite scenes unavailable
              </p>
              <p className="mt-0.5 text-xs text-ink-300">{scenes.error}</p>
            </div>
          ) : null}
          {showSceneEmpty ? (
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg border border-white/10 bg-abyss-900/85 px-3 py-2 backdrop-blur">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-300">
                Satellite footprints
              </p>
              <p className="mt-0.5 text-xs text-ink-400">No scenes in this window.</p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
