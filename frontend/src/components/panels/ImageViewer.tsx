"use client";

/**
 * Satellite image viewer.
 *
 * A lightweight zoom/pan viewer for a single catalogue-rendered scene preview.
 * It is deliberately simple: AquaNexus does not have an image server, so this
 * displays the provider's own rendered preview and never pretends to be an
 * analytical raster. Metadata is shown verbatim from the catalogue record.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ImageOff, Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";

import { Chip } from "@/components/ui/primitives";

export interface ViewerScene {
  id: string;
  collection: string;
  acquiredAt?: string | null;
  cloudCover?: number | null;
  platform?: string | null;
  resolution?: string | null;
  thumbnail: string;
  recordUrl?: string | null;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

export function ImageViewer({
  scene,
  onClose,
}: {
  scene: ViewerScene | null;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [failed, setFailed] = useState(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const reset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // A new scene must not inherit the previous scene's pan/zoom or load state.
  useEffect(() => {
    reset();
    setFailed(false);
  }, [scene?.id, reset]);

  useEffect(() => {
    if (!scene) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scene, onClose]);

  if (!scene) return null;

  const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Satellite image viewer for ${scene.id}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-abyss-950/85 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-white/10 bg-abyss-900 shadow-float"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-ink-100" title={scene.id}>
              {scene.id}
            </p>
            <p className="text-[0.6875rem] text-ink-400">
              Provider-rendered preview — not an AquaNexus analytical raster
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close image viewer"
            className="rounded-md p-1.5 text-ink-300 transition hover:bg-white/[0.06] hover:text-ink-100"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-abyss-950"
          style={{ cursor: zoom > 1 ? (dragRef.current ? "grabbing" : "grab") : "default" }}
          onPointerDown={(event) => {
            if (zoom === 1) return;
            dragRef.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
          }}
          onPointerMove={(event) => {
            const start = dragRef.current;
            if (!start) return;
            setOffset({ x: event.clientX - start.x, y: event.clientY - start.y });
          }}
          onPointerUp={() => {
            dragRef.current = null;
          }}
          onPointerLeave={() => {
            dragRef.current = null;
          }}
        >
          {failed ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <ImageOff className="h-6 w-6 text-ink-600" aria-hidden />
              <p className="max-w-xs text-xs text-ink-400">
                The catalogue preview for this scene could not be loaded. The
                record below is still the catalogue metadata for the scene.
              </p>
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={scene.thumbnail}
              alt={`Rendered preview for scene ${scene.id}`}
              draggable={false}
              onError={() => setFailed(true)}
              className="max-h-[62vh] w-auto select-none object-contain transition-transform duration-100"
              style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-4 py-2.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => setZoom((z) => clampZoom(z - 0.5))}
              className="rounded-md border border-white/10 p-1.5 text-ink-200 transition hover:bg-white/[0.06]"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden />
            </button>
            <span className="w-12 text-center text-[0.6875rem] text-ink-400">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => setZoom((z) => clampZoom(z + 0.5))}
              className="rounded-md border border-white/10 p-1.5 text-ink-200 transition hover:bg-white/[0.06]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Reset view"
              onClick={reset}
              className="ml-1 rounded-md border border-white/10 p-1.5 text-ink-200 transition hover:bg-white/[0.06]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Chip>{scene.collection}</Chip>
            {scene.resolution ? <Chip>{scene.resolution}</Chip> : null}
            {scene.platform ? <Chip>{scene.platform}</Chip> : null}
            {scene.acquiredAt ? <Chip>{scene.acquiredAt.slice(0, 10)}</Chip> : null}
            {scene.cloudCover !== null && scene.cloudCover !== undefined ? (
              <Chip>{Math.round(scene.cloudCover)}% cloud</Chip>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-3">
            {scene.recordUrl ? (
              <a
                href={scene.recordUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-[0.6875rem] text-water-300 transition hover:text-water-200"
              >
                <Maximize2 className="h-3 w-3" aria-hidden />
                Full record
              </a>
            ) : null}
            <a
              href={scene.thumbnail}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-[0.6875rem] text-water-300 transition hover:text-water-200"
            >
              <Maximize2 className="h-3 w-3" aria-hidden />
              Original preview
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
