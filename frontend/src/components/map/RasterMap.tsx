"use client";

/**
 * Non-WebGL interactive map.
 *
 * A genuine slippy map built from raster tiles rendered as plain <img>
 * elements. It needs no WebGL context, so it stays fully usable in sessions
 * where MapLibre GL cannot start (software renderer, hardware acceleration
 * disabled, remote desktop). It is not a screenshot or a decorative grid: it
 * implements real Web Mercator projection, so pan, zoom, click-to-select and
 * the selected-location marker all behave like the GL map.
 *
 * Everything drawn here is tied to real state: the tiles are real geographic
 * tiles, the marker is the user's own selected coordinate, and satellite
 * footprints come from actual STAC bounding boxes. Nothing is fabricated.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

import type { StacItem } from "@/lib/schemas";
import { cn } from "@/lib/utils";

const TILE_SIZE = 256;
const MIN_ZOOM = 1;
const MAX_ZOOM = 18;
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = "© OpenStreetMap contributors";

export interface RasterMapLocation {
  latitude: number;
  longitude: number;
}

/**
 * An optional global raster overlay drawn above the base tiles.
 *
 * `template` is a WMTS/WMS tile URL containing `{z}/{x}/{y}` placeholders (the
 * backend catalog supplies it). The overlay is limited to `maxZoom` because the
 * underlying product has a fixed resolution; beyond that the tiles are scaled up
 * ("overzoomed") rather than requesting tiles the provider does not serve.
 */
export interface RasterOverlay {
  id: string;
  name: string;
  template: string;
  maxZoom: number;
  opacity: number;
}

interface RasterMapProps {
  location: RasterMapLocation | null;
  onSelect: (latitude: number, longitude: number) => void;
  scenes?: StacItem[];
  showScenes?: boolean;
  overlay?: RasterOverlay | null;
  className?: string;
  ariaLabel?: string;
}

/** Longitude/latitude → world pixel coordinate at a given zoom scale (2^z). */
function lonToWorldX(lon: number, scale: number): number {
  return ((lon + 180) / 360) * scale * TILE_SIZE;
}

function latToWorldY(lat: number, scale: number): number {
  const clamped = Math.max(Math.min(lat, 85.05112878), -85.05112878);
  const rad = (clamped * Math.PI) / 180;
  const merc = Math.log(Math.tan(Math.PI / 4 + rad / 2));
  return (1 - merc / Math.PI) / 2 * scale * TILE_SIZE;
}

function worldXToLon(x: number, scale: number): number {
  return (x / (scale * TILE_SIZE)) * 360 - 180;
}

function worldYToLat(y: number, scale: number): number {
  const n = Math.PI - (2 * Math.PI * y) / (scale * TILE_SIZE);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

export function RasterMap({
  location,
  onSelect,
  scenes = [],
  showScenes = false,
  overlay = null,
  className,
  ariaLabel = "Interactive global map",
}: RasterMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [center, setCenter] = useState<RasterMapLocation>({ latitude: 15, longitude: 20 });
  const [zoom, setZoom] = useState(2);
  const [dragging, setDragging] = useState(false);
  const [failedTiles, setFailedTiles] = useState(0);
  const [tilesLoaded, setTilesLoaded] = useState(0);

  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startCenter: RasterMapLocation;
  } | null>(null);
  // Set when a drag actually moves, so the ensuing click does not also select.
  const movedRef = useRef(false);

  const scale = useMemo(() => 2 ** zoom, [zoom]);

  // Measure the container so the map always fills its box (and survives layout
  // changes when the surrounding rails resize).
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () =>
      setSize({ width: node.clientWidth, height: node.clientHeight });
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const centerWorldX = lonToWorldX(center.longitude, scale);
  const centerWorldY = latToWorldY(center.latitude, scale);

  // Which tiles are visible, and where each one sits in container pixels.
  const tiles = useMemo(() => {
    if (!size.width || !size.height) return [];
    const tileCount = scale;
    const minX = Math.floor((centerWorldX - size.width / 2) / TILE_SIZE);
    const maxX = Math.floor((centerWorldX + size.width / 2) / TILE_SIZE);
    const minY = Math.max(0, Math.floor((centerWorldY - size.height / 2) / TILE_SIZE));
    const maxY = Math.min(
      tileCount - 1,
      Math.floor((centerWorldY + size.height / 2) / TILE_SIZE),
    );
    const out: { key: string; url: string; left: number; top: number }[] = [];
    for (let x = minX; x <= maxX; x += 1) {
      // Wrap longitude so panning across the antimeridian keeps working.
      const wrappedX = ((x % tileCount) + tileCount) % tileCount;
      for (let y = minY; y <= maxY; y += 1) {
        out.push({
          key: `${zoom}/${wrappedX}/${y}`,
          url: TILE_URL.replace("{z}", String(zoom))
            .replace("{x}", String(wrappedX))
            .replace("{y}", String(y)),
          left: x * TILE_SIZE - centerWorldX + size.width / 2,
          top: y * TILE_SIZE - centerWorldY + size.height / 2,
        });
      }
    }
    return out;
  }, [centerWorldX, centerWorldY, scale, zoom, size.width, size.height]);

  // Reset tile error accounting whenever the visible set changes.
  const centerKey = `${Math.round(center.latitude)}:${Math.round(center.longitude)}`;
  useEffect(() => {
    setFailedTiles(0);
    setTilesLoaded(0);
  }, [zoom, centerKey]);

  // Global raster overlay tiles (e.g. NASA GIBS).
  //
  // The overlay product has a fixed resolution, so it is requested at its own
  // maximum zoom and scaled up on screen when the base map is zoomed further
  // in. That is honest: the imagery is not pretending to be more detailed than
  // the source, and no tiles beyond the product's zoom are requested.
  const overlayZoom = useMemo(
    () => (overlay ? Math.min(zoom, overlay.maxZoom) : zoom),
    [overlay, zoom],
  );
  const overlayTileScreenSize = TILE_SIZE * 2 ** (zoom - overlayZoom);

  const overlayTiles = useMemo(() => {
    if (!overlay || !size.width || !size.height) return [];
    const scaleFactor = 2 ** overlayZoom;
    const centerX = lonToWorldX(center.longitude, scaleFactor);
    const centerY = latToWorldY(center.latitude, scaleFactor);
    const minX = Math.floor((centerX - size.width / 2) / TILE_SIZE);
    const maxX = Math.floor((centerX + size.width / 2) / TILE_SIZE);
    const minY = Math.max(0, Math.floor((centerY - size.height / 2) / TILE_SIZE));
    const maxY = Math.min(
      scaleFactor - 1,
      Math.floor((centerY + size.height / 2) / TILE_SIZE),
    );
    const out: { key: string; url: string; left: number; top: number }[] = [];
    for (let x = minX; x <= maxX; x += 1) {
      const wrappedX = ((x % scaleFactor) + scaleFactor) % scaleFactor;
      for (let y = minY; y <= maxY; y += 1) {
        out.push({
          key: `${overlay.id}/${overlayZoom}/${wrappedX}/${y}`,
          url: overlay.template
            .replace("{z}", String(overlayZoom))
            .replace("{x}", String(wrappedX))
            .replace("{y}", String(y)),
          left: x * TILE_SIZE - centerX + size.width / 2,
          top: y * TILE_SIZE - centerY + size.height / 2,
        });
      }
    }
    return out;
  }, [
    overlay,
    overlayZoom,
    center.latitude,
    center.longitude,
    size.width,
    size.height,
  ]);

  const clampZoom = useCallback((next: number) => {
    setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next)));
  }, []);

  // Recenter the fallback map when the workspace location changes (e.g. a place
  // was chosen from search), without dropping below a readable zoom.
  useEffect(() => {
    if (!location) return;
    setCenter({ latitude: location.latitude, longitude: location.longitude });
    setZoom((z) => Math.max(z, 5));
  }, [location?.latitude, location?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  const pixelToLatLon = useCallback(
    (px: number, py: number): RasterMapLocation => {
      const worldX = centerWorldX + (px - size.width / 2);
      const worldY = centerWorldY + (py - size.height / 2);
      return {
        latitude: worldYToLat(worldY, scale),
        longitude: worldXToLon(worldX, scale),
      };
    },
    [centerWorldX, centerWorldY, scale, size.width, size.height],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      movedRef.current = false;
      dragState.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startCenter: center,
      };
      (event.target as Element).setPointerCapture?.(event.pointerId);
      setDragging(true);
    },
    [center],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = dragState.current;
      if (!state || state.pointerId !== event.pointerId) return;
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movedRef.current = true;
      // Drag the world with the pointer: the center moves opposite the delta.
      const startX = lonToWorldX(state.startCenter.longitude, scale);
      const startY = latToWorldY(state.startCenter.latitude, scale);
      const nextLon = worldXToLon(startX - dx, scale);
      const nextLat = worldYToLat(startY - dy, scale);
      setCenter({
        latitude: Math.max(-85, Math.min(85, nextLat)),
        longitude: ((nextLon + 540) % 360) - 180,
      });
    },
    [scale],
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    dragState.current = null;
    setDragging(false);
  }, []);

  const onClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (movedRef.current) {
        movedRef.current = false;
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const { latitude, longitude } = pixelToLatLon(
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
      onSelect(Number(latitude.toFixed(5)), Number(longitude.toFixed(5)));
    },
    [onSelect, pixelToLatLon],
  );

  // Wheel zoom (non-passive so preventDefault actually stops page scroll).
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + (event.deltaY < 0 ? 1 : -1))));
    };
    node.addEventListener("wheel", handler, { passive: false });
    return () => node.removeEventListener("wheel", handler);
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = 80;
      const startX = lonToWorldX(center.longitude, scale);
      const startY = latToWorldY(center.latitude, scale);
      const move = (dx: number, dy: number) => {
        setCenter({
          latitude: Math.max(-85, Math.min(85, worldYToLat(startY - dy, scale))),
          longitude: ((worldXToLon(startX - dx, scale) + 540) % 360) - 180,
        });
      };
      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          move(0, step);
          break;
        case "ArrowDown":
          event.preventDefault();
          move(0, -step);
          break;
        case "ArrowLeft":
          event.preventDefault();
          move(step, 0);
          break;
        case "ArrowRight":
          event.preventDefault();
          move(-step, 0);
          break;
        case "+":
        case "=":
          event.preventDefault();
          clampZoom(zoom + 1);
          break;
        case "-":
        case "_":
          event.preventDefault();
          clampZoom(zoom - 1);
          break;
        default:
          break;
      }
    },
    [center.latitude, center.longitude, clampZoom, scale, zoom],
  );

  const markerPos = useMemo(() => {
    if (!location) return null;
    const x = lonToWorldX(location.longitude, scale) - centerWorldX + size.width / 2;
    const y = latToWorldY(location.latitude, scale) - centerWorldY + size.height / 2;
    return { x, y };
  }, [location, scale, centerWorldX, centerWorldY, size.width, size.height]);

  const sceneBoxes = useMemo(() => {
    if (!showScenes || !scenes.length) return [];
    return scenes
      .filter((item): item is StacItem & { bbox: number[] } =>
        Array.isArray(item.bbox) && item.bbox.length === 4,
      )
      .map((item) => {
        const [west, south, east, north] = item.bbox as [number, number, number, number];
        const x1 = lonToWorldX(west, scale) - centerWorldX + size.width / 2;
        const x2 = lonToWorldX(east, scale) - centerWorldX + size.width / 2;
        const y1 = latToWorldY(north, scale) - centerWorldY + size.height / 2;
        const y2 = latToWorldY(south, scale) - centerWorldY + size.height / 2;
        return { id: item.id, left: x1, top: y1, width: x2 - x1, height: y2 - y1 };
      });
  }, [scenes, showScenes, scale, centerWorldX, centerWorldY, size.width, size.height]);

  const allTilesFailed = tiles.length > 0 && failedTiles >= tiles.length && tilesLoaded === 0;

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={ariaLabel}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        "relative h-full w-full select-none overflow-hidden bg-abyss-950 outline-none",
        dragging ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
    >
      {/* Raster tiles. Positioned in world-pixel space; no WebGL involved. */}
      {tiles.map((tile) => (
        <img
          key={tile.key}
          src={tile.url}
          alt=""
          draggable={false}
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setTilesLoaded((n) => n + 1)}
          onError={() => setFailedTiles((n) => n + 1)}
          className="pointer-events-none absolute"
          style={{
            left: tile.left,
            top: tile.top,
            width: TILE_SIZE,
            height: TILE_SIZE,
          }}
        />
      ))}

      {/* Global raster overlay (e.g. NASA GIBS precipitation/heat/water). */}
      {overlay
        ? overlayTiles.map((tile) => (
            <img
              key={tile.key}
              src={tile.url}
              alt=""
              draggable={false}
              loading="eager"
              decoding="async"
              referrerPolicy="no-referrer"
              className="pointer-events-none absolute"
              style={{
                left: tile.left,
                top: tile.top,
                width: overlayTileScreenSize,
                height: overlayTileScreenSize,
                opacity: overlay.opacity,
              }}
            />
          ))
        : null}

      {/* Satellite scene footprints from real STAC bounding boxes. */}
      {sceneBoxes.map((box) => (
        <div
          key={box.id}
          aria-hidden
          className="pointer-events-none absolute border border-teal-400/70 bg-teal-400/[0.06]"
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        />
      ))}

      {/* Selected-location marker. */}
      {markerPos ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: markerPos.x, top: markerPos.y }}
        >
          <span className="aquanexus-marker">
            <span className="aquanexus-marker__ring" />
            <span className="aquanexus-marker__dot" />
          </span>
        </div>
      ) : null}

      {/* Zoom controls — the GL map's NavigationControl equivalent. */}
      <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-lg border border-white/10 bg-abyss-800/90 shadow-float backdrop-blur">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            clampZoom(zoom + 1);
          }}
          aria-label="Zoom in"
          disabled={zoom >= MAX_ZOOM}
          className="flex h-9 w-9 items-center justify-center text-ink-100 transition hover:bg-water-400/15 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
        <span className="h-px w-full bg-white/10" aria-hidden />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            clampZoom(zoom - 1);
          }}
          aria-label="Zoom out"
          disabled={zoom <= MIN_ZOOM}
          className="flex h-9 w-9 items-center justify-center text-ink-100 transition hover:bg-water-400/15 disabled:opacity-40"
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Zoom level readout. */}
      <div className="pointer-events-none absolute right-3 top-[6.5rem] rounded-md border border-white/10 bg-abyss-900/85 px-2 py-1 font-mono text-[0.625rem] text-ink-300 backdrop-blur">
        z{zoom}
      </div>

      {allTilesFailed ? (
        <div
          role="status"
          className="pointer-events-none absolute left-3 top-3 max-w-xs rounded-lg border border-signal-caution/30 bg-abyss-900/90 px-3 py-2 backdrop-blur"
        >
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-signal-caution">
            Base tiles unavailable
          </p>
          <p className="mt-0.5 text-xs text-ink-300">
            Map tiles could not be loaded (network or tile server). Pan, zoom and
            click-to-select still work; only the base imagery is missing.
          </p>
        </div>
      ) : null}

      <div className="pointer-events-none absolute bottom-0 right-0 z-10 px-2 py-1 text-[0.625rem] text-ink-400">
        <span className="rounded bg-abyss-950/70 px-1.5 py-0.5 backdrop-blur">{ATTRIBUTION}</span>
      </div>
    </div>
  );
}
