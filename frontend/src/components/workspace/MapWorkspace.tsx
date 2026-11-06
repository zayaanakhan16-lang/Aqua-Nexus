"use client";

/**
 * Shared map workspace layout.
 *
 * The map takes the remaining width and the investigation rail sits in a
 * fixed-width column on the right, so the panel never overlaps the map and the
 * document never grows wider than the viewport. The top-centre Map / Analytics
 * control and the vertical left toolbar float over the map; on small screens
 * the rail becomes a slide-over and the same content is reachable.
 */
import { useState, type ReactNode } from "react";
import { PanelRight, X } from "lucide-react";

import { cn } from "@/lib/utils";

export function MapWorkspace({
  children,
  rail,
  railLabel = "Investigations",
  railCount,
  overlay,
  className,
}: {
  children: ReactNode;
  rail: ReactNode;
  railLabel?: string;
  railCount?: number;
  /** Elements that float over the map (toolbar, status bar, mode toggle). */
  overlay?: ReactNode;
  className?: string;
}) {
  const [railOpen, setRailOpen] = useState(false);

  return (
    <div className={cn("flex min-h-0 w-full flex-1 overflow-hidden", className)}>
      <div className="relative min-w-0 flex-1">
        {children}

        {overlay}

        {/* Small screens: the rail becomes a slide-over, never a second column. */}
        <button
          type="button"
          onClick={() => setRailOpen(true)}
          className="chrome absolute right-3 top-3 z-30 flex items-center gap-1.5 px-2.5 py-1.5 text-2xs font-medium text-ink-200 hover:text-ink-50 lg:hidden"
          aria-label={`Show ${railLabel.toLowerCase()}`}
        >
          <PanelRight className="h-3.5 w-3.5" aria-hidden />
          {railLabel}
          {typeof railCount === "number" ? (
            <span className="font-mono tabular-nums text-ink-400">{railCount}</span>
          ) : null}
        </button>

        {railOpen ? (
          <div className="absolute inset-0 z-40 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
              onClick={() => setRailOpen(false)}
              aria-label={`Close ${railLabel.toLowerCase()}`}
            />
            <aside className="absolute inset-y-0 right-0 flex w-[20rem] max-w-[88vw] flex-col gap-2.5 overflow-y-auto border-l border-white/10 bg-abyss-950/97 p-3">
              <button
                type="button"
                onClick={() => setRailOpen(false)}
                className="ml-auto flex items-center gap-1 text-2xs font-medium text-ink-400 hover:text-ink-100"
              >
                Close
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
              {rail}
            </aside>
          </div>
        ) : null}
      </div>

      <aside
        data-testid="investigation-rail"
        className="hidden w-[20rem] shrink-0 flex-col gap-2.5 overflow-y-auto border-l border-white/[0.08] bg-abyss-900/50 p-3 lg:flex"
      >
        {rail}
      </aside>
    </div>
  );
}
