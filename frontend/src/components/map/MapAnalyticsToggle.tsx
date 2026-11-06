"use client";

/**
 * Map / Analytics segmented control, floating at the top centre of the
 * workspace.
 *
 * This is the *only* workspace-mode navigation: the app shell deliberately does
 * not repeat it in the header, so the same control is never presented twice.
 */
import { BarChart3, Globe2 } from "lucide-react";

import { cn } from "@/lib/utils";

export type WorkspaceMode = "map" | "analytics";

export function MapAnalyticsToggle({
  mode,
  onChange,
  className,
}: {
  mode: WorkspaceMode;
  onChange: (mode: WorkspaceMode) => void;
  className?: string;
}) {
  const options: { id: WorkspaceMode; label: string; icon: typeof Globe2 }[] = [
    { id: "map", label: "Map", icon: Globe2 },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
  ];

  return (
    <div role="tablist" aria-label="Workspace mode" className={cn("chrome inline-flex items-center gap-0.5 p-0.5", className)}>
      {options.map((option) => {
        const active = mode === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-[0.625rem] px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-ink-100 text-abyss-950 shadow-panel"
                : "text-ink-300 hover:text-ink-50",
            )}
          >
            <option.icon className="h-3.5 w-3.5" aria-hidden />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
