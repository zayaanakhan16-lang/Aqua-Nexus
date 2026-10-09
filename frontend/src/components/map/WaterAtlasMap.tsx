"use client";

/**
 * Global water atlas map.
 *
 * MapLibre GL JS v5 with a genuine 3D globe projection (default) and a key-free
 * OpenFreeMap style (BSD-3-Clause / OpenMapTiles / OpenStreetMap data). Clicking
 * the map selects a coordinate; a marker shows the active location; satellite
 * scene footprints render only when the satellite layer is enabled and real
 * scene metadata has loaded. Nothing decorative is drawn: every overlay is tied
 * to state, and no map style or layer invents imagery or water data.
 */
import { useEffect, useRef } from "react";
import { Compass, Minus, Plus, RotateCcw } from "lucide-react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";

import { useWorkspace } from "@/lib/workspace";
import type { StacItem } from "@/lib/schemas";

import "maplibre-gl/dist/maplibre-gl.css";

const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const SCENES_SOURCE = "aquanexus-scenes";
const SCENES_FILL = "aquanexus-scenes-fill";

// Global view constants. The globe is always reachable at these values, and
// "Reset to global view" returns here. The camera never locks to a region.
const GLOBAL_CENTER: [number, number] = [0, 20];
const GLOBAL_ZOOM = 1.7;
const GLOBAL_PITCH = 0;
const GLOBAL_BEARING = 0;
const MIN_ZOOM = 0.9;
const MAX_ZOOM = 14;
const FOCUS_ZOOM = 3.2;

/**
 * Map camera controls. These bind to the MapLibre instance on the client so
 * they remain fully keyboard-accessible (real buttons) and do not rely on the
 * style's own control DOM. Zoom-out is enabled down to the global view.
 */
function MapCanvasControls({ mapRef }: { mapRef: React.RefObject<MapLibreMap | null> }) {
  const { location, clearLocation } = useWorkspace();

  const zoomBy = (delta: number) =>
    mapRef.current?.zoomTo(mapRef.current.getZoom() + delta, { duration: 260 });
  const resetGlobal = () =>
    mapRef.current?.flyTo({
      center: GLOBAL_CENTER,
      zoom: GLOBAL_ZOOM,
      pitch: GLOBAL_PITCH,
      bearing: GLOBAL_BEARING,
      duration: 900,
    });

  const buttonClass =
    "flex h-8 w-8 items-center justify-center text-ink-200 transition hover:text-ink-50 disabled:cursor-not-allowed disabled:text-ink-600";

  return (
    <>
      <div className="pointer-events-auto absolute right-3 top-3 z-10 flex flex-col overflow-hidden rounded-lg border border-white/10 bg-abyss-800/90 shadow-float backdrop-blur">
        <button
          type="button"
          onClick={() => zoomBy(1)}
          aria-label="Zoom in"
          title="Zoom in"
          className={buttonClass}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(-1)}
          aria-label="Zoom out"
          title="Zoom out"
          className={`${buttonClass} border-t border-white/10`}
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={resetGlobal}
          aria-label="Reset to global view"
          title="Reset to global view"
          className={`${buttonClass} border-t border-white/10`}
        >
          <Compass className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={resetGlobal}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-abyss-800/90 px-2.5 py-1.5 text-xs font-medium text-ink-100 shadow-float backdrop-blur transition hover:text-ink-50"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Reset to global view
        </button>
        {location ? (
          <button
            type="button"
            onClick={clearLocation}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-abyss-800/90 px-2.5 py-1.5 text-xs font-medium text-ink-300 shadow-float backdrop-blur transition hover:text-ink-100"
          >
            Clear selection
          </button>
        ) : null}
      </div>
    </>
  );
}

export function WaterAtlasMap() {
  const { location, layers, scenes, selectLocation } = useWorkspace();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  // Whether the initial location (if any) has been framed once.
  const initialFramedRef = useRef(false);

  // Initialise the map once, in the 3D globe projection.
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: GLOBAL_CENTER,
      zoom: GLOBAL_ZOOM,
      pitch: GLOBAL_PITCH,
      bearing: GLOBAL_BEARING,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      attributionControl: { compact: true },
    });
    map.on("error", (e) => {
      // Surface style/tile failures instead of failing silently.
      console.error("[AquaNexus map]", e?.error instanceof Error ? e.error.message : e);
    });
    mapRef.current = map;

    // Genuine 3D globe projection (MapLibre GL JS v5). No new library needed.
    map.on("style.load", () => {
      map.setProjection({ type: "globe" });
    });

    // MapLibre sizes from the container's box on load, so keep it in sync when
    // the surrounding grid/rails change size (window resize alone is not enough).
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("click", (event) => {
      const { lat, lng } = event.lngLat;
      selectLocation({
        latitude: Number(lat.toFixed(5)),
        longitude: Number(lng.toFixed(5)),
        label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        place: null,
      });
    });

    map.on("load", () => {
      map.addSource(SCENES_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: SCENES_FILL,
        type: "line",
        source: SCENES_SOURCE,
        paint: { "line-color": "#39d3b4", "line-width": 1.4, "line-opacity": 0.85 },
        layout: { visibility: "none" },
      });
    });

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }, [location, layers.places]);

  // Navigate to a new selection without ever restricting the map: fly to the
  // point at a fixed focus zoom (not a country bbox). A location cleared back to
  // null (e.g. "Clear selection") returns the camera to the full global view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!location) {
      // Only recentre on an explicit clear, not on the initial empty render.
      if (initialFramedRef.current) {
        map.flyTo({
          center: GLOBAL_CENTER,
          zoom: GLOBAL_ZOOM,
          pitch: GLOBAL_PITCH,
          bearing: GLOBAL_BEARING,
          duration: 900,
        });
      }
      return;
    }

    if (!initialFramedRef.current) {
      initialFramedRef.current = true;
      map.jumpTo({ center: [location.longitude, location.latitude], zoom: FOCUS_ZOOM });
      return;
    }

    map.flyTo({
      center: [location.longitude, location.latitude],
      zoom: FOCUS_ZOOM,
      pitch: GLOBAL_PITCH,
      bearing: GLOBAL_BEARING,
      duration: 900,
    });
  }, [location]);

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
  }, [scenes.data, layers.satellite]);

  const sceneCount = scenes.data?.items.length ?? 0;
  const showSceneBadge = layers.satellite && sceneCount > 0;
  const showSceneError = layers.satellite && scenes.error && !scenes.loading;
  const showSceneEmpty =
    layers.satellite && !scenes.error && !scenes.loading && scenes.data !== null && sceneCount === 0;

  return (
    <div className="relative h-full w-full">
      {/* The map container must always fill its parent. MapLibre's own stylesheet
          is injected at runtime and sets `.maplibregl-map { position: relative }`
          with the same specificity as Tailwind's `.absolute` but later in the
          cascade, which would override it and collapse the element to zero
          height (inset-0 cannot stretch a relative box). `!absolute` forces the
          override so the map has a non-zero box. */}
      <div
        ref={containerRef}
        className="!absolute inset-0"
        aria-label="Interactive global 3D globe"
      />
      <MapCanvasControls mapRef={mapRef} />
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
    </div>
  );
}
