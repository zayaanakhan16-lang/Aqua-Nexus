"use client";

/** Map layer controls. Every toggle is wired to real state. */
import { CloudRain, Droplets, Layers, Satellite, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import { useWorkspace, type LayerId } from "@/lib/workspace";

const LAYERS: {
  id: LayerId;
  label: string;
  description: string;
  icon: typeof Layers;
}[] = [
  {
    id: "precipitation",
    label: "Precipitation",
    description: "Rainfall series for the selected point",
    icon: CloudRain,
  },
  {
    id: "discharge",
    label: "River discharge",
    description: "Modelled GloFAS discharge",
    icon: Droplets,
  },
  {
    id: "satellite",
    label: "Satellite scenes",
    description: "Sentinel footprints (metadata only)",
    icon: Satellite,
  },
  {
    id: "places",
    label: "Place markers",
    description: "Highlight the searched place",
    icon: MapPin,
  },
];

export function LayerControls() {
  const { layers, toggleLayer } = useWorkspace();

  return (
    <div className="panel p-3">
      <div className="mb-2 flex items-center gap-2 px-1">
        <Layers className="h-4 w-4 text-water-300" aria-hidden />
        <p className="label-caps">Map layers</p>
      </div>
      <ul className="space-y-1">
        {LAYERS.map((layer) => {
          const Icon = layer.icon;
          const active = layers[layer.id];
          return (
            <li key={layer.id}>
              <button
                type="button"
                role="switch"
                aria-checked={active}
                onClick={() => toggleLayer(layer.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition",
                  active
                    ? "border-water-400/30 bg-water-400/[0.08]"
                    : "border-transparent hover:bg-white/[0.04]",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    active ? "text-water-300" : "text-ink-500",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-xs font-medium",
                      active ? "text-ink-100" : "text-ink-300",
                    )}
                  >
                    {layer.label}
                  </span>
                  <span className="block truncate text-[0.6875rem] text-ink-500">
                    {layer.description}
                  </span>
                </span>
                <span
                  className={cn(
                    "relative h-4 w-7 shrink-0 rounded-full transition",
                    active ? "bg-water-400" : "bg-ink-700",
                  )}
                  aria-hidden
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all",
                      active ? "left-3.5" : "left-0.5",
                    )}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
