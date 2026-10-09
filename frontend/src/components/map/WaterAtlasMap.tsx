"use client";

/**
 * Global water atlas map.
 *
 * MapLibre GL with a key-free OpenFreeMap style. Clicking the map selects a
 * coordinate; a marker shows the active location; satellite scene footprints
 * render only when the satellite layer is enabled and real scene metadata has
 * loaded. Nothing decorative is drawn: every overlay is tied to state.
 */
import { useEffect, useRef } from "react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";

import { useWorkspace } from "@/lib/workspace";
import type { StacItem } from "@/lib/schemas";

import "maplibre-gl/dist/maplibre-gl.css";

const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const SCENES_SOURCE = "aquanexus-scenes";
const SCENES_FILL = "aquanexus-scenes-fill";

export function WaterAtlasMap() {
  const { location, layers, scenes, selectLocation } = useWorkspace();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  // Initialise the map once.
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [20, 15],
      zoom: 1.6,
      minZoom: 0.6,
      maxZoom: 14,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    // MapLibre sizes from the container's box on load, so keep it in sync when
    // the surrounding grid/rails change size (window resize alone is not enough).
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
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

  // Recenter on a new selection, independently of marker visibility.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !location) return;
    map.easeTo({
      center: [location.longitude, location.latitude],
      zoom: Math.max(map.getZoom(), 4),
      duration: 700,
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
      <div ref={containerRef} className="!absolute inset-0" aria-label="Interactive global map" />
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
