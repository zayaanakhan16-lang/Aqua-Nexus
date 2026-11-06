"use client";

/**
 * Vertical map toolbar pinned to the left edge of the map workspace.
 *
 * Layers, zoom, the map/imagery view switch, area drawing and the extra map
 * tools all live here so the right edge stays clear for the investigation rail
 * and the top centre stays clear for the Map / Analytics control. Every control
 * is wired to real map state; nothing here is decorative.
 */
import { useState, type ReactNode } from "react";
import {
  Check,
  Compass,
  Layers,
  LocateFixed,
  Map as MapIcon,
  Minus,
  Palette,
  Pencil,
  Plus,
  Satellite,
  Tags,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { MapViewMode } from "@/lib/map-ui";

export type { MapViewMode };

export interface BasemapOption {
  id: string;
  label: string;
  description: string;
}

export interface MapToolbarProps {
  basemaps: readonly BasemapOption[];
  basemap: string;
  onSelectBasemap: (id: string) => void;
  viewMode: MapViewMode;
  onToggleView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  drawing: boolean;
  onToggleDraw: () => void;
  vertexCount: number;
  onFinishDraw: () => void;
  onCancelDraw: () => void;
  onLocate: () => void;
  locating: boolean;
  labelsVisible: boolean;
  onToggleLabels: () => void;
  onResetNorth: () => void;
  /** Whether the layer panel is open; owned by the map so the panel, the
   *  status bar and the fallback all agree on one source of truth. */
  layersOpen: boolean;
  onToggleLayers: () => void;
  className?: string;
}

export function MapToolbar({
  basemaps,
  basemap,
  onSelectBasemap,
  viewMode,
  onToggleView,
  onZoomIn,
  onZoomOut,
  drawing,
  onToggleDraw,
  vertexCount,
  onFinishDraw,
  onCancelDraw,
  onLocate,
  locating,
  labelsVisible,
  onToggleLabels,
  onResetNorth,
  layersOpen,
  onToggleLayers,
  className,
}: MapToolbarProps) {
  const [basemapOpen, setBasemapOpen] = useState(false);
  const active = basemaps.find((option) => option.id === basemap);

  return (
    <div className={cn("pointer-events-auto flex flex-col items-center gap-2", className)}>
      {/* ------------------------------------------------------------- layers */}
      <ToolbarButton label="Map layers" pressed={layersOpen} onClick={onToggleLayers}>
        <Layers className="h-4 w-4" />
      </ToolbarButton>

      {/* ------------------------------------------------------------ basemap */}
      <div className="relative">
        <ToolbarButton
          label="Basemap"
          pressed={basemapOpen}
          onClick={() => setBasemapOpen((value) => !value)}
        >
          <Palette className="h-4 w-4" />
        </ToolbarButton>

        {basemapOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default"
              aria-label="Close basemap menu"
              onClick={() => setBasemapOpen(false)}
            />
            <ul
              role="listbox"
              aria-label="Basemap"
              className="chrome absolute left-11 top-0 z-50 w-[15.5rem] overflow-hidden p-1.5"
            >
              {basemaps.map((option) => {
                const selected = option.id === basemap;
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onSelectBasemap(option.id);
                        setBasemapOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                        selected ? "bg-water-300/[0.12]" : "hover:bg-white/[0.06]",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                          selected ? "border-water-300 bg-water-300" : "border-white/25",
                        )}
                        aria-hidden
                      >
                        {selected ? <Check className="h-2.5 w-2.5 text-abyss-950" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block text-xs font-semibold",
                            selected ? "text-water-200" : "text-ink-100",
                          )}
                        >
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-2xs leading-relaxed text-ink-400">
                          {option.description}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </div>

      {/* ------------------------------------------------------------- zoom */}
      <div className="flex flex-col overflow-hidden rounded-full border border-white/10 bg-abyss-900/85 shadow-float backdrop-blur">
        <button
          type="button"
          onClick={onZoomIn}
          className="flex h-9 w-9 items-center justify-center text-ink-200 transition-colors hover:bg-white/10 hover:text-ink-50"
          aria-label="Zoom in"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
        <span className="mx-auto h-px w-5 bg-white/10" aria-hidden />
        <button
          type="button"
          onClick={onZoomOut}
          className="flex h-9 w-9 items-center justify-center text-ink-200 transition-colors hover:bg-white/10 hover:text-ink-50"
          aria-label="Zoom out"
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* -------------------------------------------------------- view switch */}
      <ToolbarButton
        label={viewMode === "imagery" ? "Switch to map view" : "Switch to imagery view"}
        onClick={onToggleView}
        pressed={viewMode === "imagery"}
      >
        {viewMode === "imagery" ? (
          <Satellite className="h-4 w-4" />
        ) : (
          <MapIcon className="h-4 w-4" />
        )}
      </ToolbarButton>

      {/* ------------------------------------------------------------- tools */}
      <div className="flex flex-col items-center gap-2 rounded-full border border-white/10 bg-abyss-900/85 p-1 shadow-float backdrop-blur">
        <ToolbarButton label="Draw an area" onClick={onToggleDraw} pressed={drawing} bare>
          <Pencil className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Go to my location" onClick={onLocate} pressed={locating} bare>
          <LocateFixed className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label={labelsVisible ? "Hide place labels" : "Show place labels"}
          onClick={onToggleLabels}
          pressed={labelsVisible}
          bare
        >
          <Tags className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Reset orientation to north" onClick={onResetNorth} bare>
          <Compass className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {/* --------------------------------------------- draw commit/cancel actions */}
      {drawing ? (
        <div className="chrome flex flex-col items-stretch gap-1 p-1.5">
          <button
            type="button"
            onClick={onFinishDraw}
            disabled={vertexCount < 3}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-boundary/90 px-2.5 py-1.5 text-2xs font-semibold text-abyss-950 transition hover:bg-boundary-soft disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
            Save area
          </button>
          <button
            type="button"
            onClick={onCancelDraw}
            className="rounded-md px-2.5 py-1.5 text-2xs font-medium text-ink-300 transition hover:bg-white/[0.06] hover:text-ink-100"
          >
            Cancel
          </button>
          <p className="px-1 pb-0.5 text-center text-3xs leading-relaxed text-ink-500">
            <span className="font-mono text-boundary-soft">{vertexCount}</span> point
            {vertexCount === 1 ? "" : "s"} · Enter saves · Esc cancels
          </p>
        </div>
      ) : null}

      {active ? (
        <span className="chrome max-w-[6.5rem] px-2 py-1 text-center text-3xs font-medium uppercase tracking-[0.08em] text-ink-400">
          {active.label}
        </span>
      ) : null}
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  pressed = false,
  bare = false,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  bare?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        "flex h-9 w-9 items-center justify-center transition-colors",
        bare ? "rounded-full" : "rounded-full border shadow-float backdrop-blur",
        pressed
          ? "border-water-300/45 bg-water-300/15 text-water-200"
          : "border-white/10 bg-abyss-900/85 text-ink-200 hover:text-ink-50",
      )}
    >
      {children}
    </button>
  );
}
