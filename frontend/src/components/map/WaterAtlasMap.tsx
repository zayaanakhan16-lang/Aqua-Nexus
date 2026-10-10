"use client";

/**
 * Global water atlas map.
 *
 * MapLibre GL JS v4 with a key-free OpenFreeMap style. Clicking the map selects a
 * coordinate; a marker shows the active location; satellite scene footprints
 * render only when the satellite layer is enabled and real scene metadata has
 * loaded. Nothing decorative is drawn: every overlay is tied to state, and no map
 * style or layer invents imagery or water data.
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
import { AlertTriangle, Globe2, RefreshCw } from "lucide-react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";

import { useWorkspace, type SelectedLocation } from "@/lib/workspace";
import type { StacItem } from "@/lib/schemas";
import { detectWebGLSupport } from "@/lib/webgl";

import "maplibre-gl/dist/maplibre-gl.css";

const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const SCENES_SOURCE = "aquanexus-scenes";
const SCENES_FILL = "aquanexus-scenes-fill";

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

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error) return error;
  return GENERIC_UNAVAILABLE;
}

/**
 * Static geographic fallback.
 *
 * A plain equirectangular coordinate graticule drawn as SVG: meridians and
 * parallels at real degree intervals with the equator and prime meridian
 * emphasised. It is not a basemap and loads no imagery — it only gives spatial
 * reference, and marks the coordinate the user selected (their own input, not
 * invented data). The SVG is decorative; the selected coordinate is already
 * announced elsewhere in the workspace.
 */
function MapFallbackGrid({ location }: { location: SelectedLocation | null }) {
  const meridians = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
  const parallels = [-60, -30, 0, 30, 60];
  return (
    <svg
      viewBox="0 0 360 180"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className="h-full w-full opacity-70"
    >
      <defs>
        <radialGradient id="aquanexus-fallback-glow" cx="50%" cy="42%" r="70%">
          <stop offset="0%" stopColor="#12a3c9" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#030914" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="360" height="180" fill="#030914" />
      <rect x="0" y="0" width="360" height="180" fill="url(#aquanexus-fallback-glow)" />
      <g stroke="#63d8f3" strokeOpacity="0.12" strokeWidth="0.4">
        {meridians.map((lon) => (
          <line key={`m${lon}`} x1={lon + 180} y1={0} x2={lon + 180} y2={180} />
        ))}
        {parallels.map((lat) => (
          <line key={`p${lat}`} x1={0} y1={90 - lat} x2={360} y2={90 - lat} />
        ))}
      </g>
      {/* Equator and prime meridian, slightly stronger. */}
      <line
        x1={0}
        y1={90}
        x2={360}
        y2={90}
        stroke="#63d8f3"
        strokeOpacity="0.28"
        strokeWidth="0.6"
      />
      <line
        x1={180}
        y1={0}
        x2={180}
        y2={180}
        stroke="#63d8f3"
        strokeOpacity="0.28"
        strokeWidth="0.6"
      />
      {location ? (
        <g>
          <circle
            cx={location.longitude + 180}
            cy={90 - location.latitude}
            r="3.4"
            fill="#eafcff"
            stroke="#12a3c9"
            strokeWidth="1.4"
          />
          <circle
            cx={location.longitude + 180}
            cy={90 - location.latitude}
            r="7"
            fill="none"
            stroke="#63d8f3"
            strokeOpacity="0.7"
            strokeWidth="0.8"
          />
        </g>
      ) : null}
    </svg>
  );
}

function MapUnavailable({
  message,
  location,
  onRetry,
}: {
  message: string;
  location: SelectedLocation | null;
  onRetry: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 overflow-hidden bg-abyss-950">
      <MapFallbackGrid location={location} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          role="alert"
          className="w-full max-w-md rounded-xl border border-white/10 bg-abyss-900/95 p-5 text-center shadow-float backdrop-blur animate-fade-in"
        >
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-signal-alert/30 bg-signal-alert/10 text-signal-alert">
            <Globe2 className="h-5 w-5" aria-hidden />
          </div>
          <h2 className="mt-3 text-sm font-semibold text-ink-100">Interactive map unavailable</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-300">
            This browser session cannot create a WebGL context, so the live map, zoom controls and
            map click-to-select are disabled. Everything else — search, layer toggles, location
            intelligence, rainfall and source panels — keeps working.
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
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-ink-100 transition hover:border-water-400/40 hover:bg-water-400/10"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Retry map
          </button>
          <p className="mt-3 text-[0.625rem] leading-relaxed text-ink-500">
            The reference grid behind this message is a static coordinate guide, not a basemap.
            Enable hardware acceleration or use a WebGL-capable browser, then retry.
          </p>
        </div>
      </div>
    </div>
  );
}

export function WaterAtlasMap() {
  const { location, layers, scenes, selectLocation } = useWorkspace();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  // Guards the "map engine failed" transition so a stream of error events cannot
  // flip us back and forth or re-render in a loop.
  const failedRef = useRef(false);
  const [status, setStatus] = useState<MapStatus>({ kind: "pending" });
  // Bumping this re-runs initialisation for the explicit retry action only.
  const [attempt, setAttempt] = useState(0);

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

    // Fully tear down the instance exactly once, tolerating a half-initialised
    // map (partial DOM / context) without throwing.
    const teardown = () => {
      if (removed) return;
      removed = true;
      resizeObserver?.disconnect();
      if (onLoad) map.off("load", onLoad);
      if (onClick) map.off("click", onClick);
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
      const { lat, lng } = event.lngLat;
      selectLocation({
        latitude: Number(lat.toFixed(5)),
        longitude: Number(lng.toFixed(5)),
        label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        place: null,
      });
    };
    map.on("click", onClick);

    onLoad = () => {
      if (!map.getSource(SCENES_SOURCE)) {
        map.addSource(SCENES_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer(SCENES_FILL)) {
        map.addLayer({
          id: SCENES_FILL,
          type: "line",
          source: SCENES_SOURCE,
          paint: { "line-color": "#39d3b4", "line-width": 1.4, "line-opacity": 0.85 },
          layout: { visibility: "none" },
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
        <MapUnavailable message={status.message} location={location} onRetry={retry} />
      ) : (
        <>
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
