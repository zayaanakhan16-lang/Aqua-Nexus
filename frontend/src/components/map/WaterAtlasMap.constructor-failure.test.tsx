import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Simulate the exact reported failure: the pre-flight probe believes WebGL is
// available, but MapLibre's constructor throws "Failed to initialize WebGL".
// The component must catch it and render the fallback rather than propagate.
vi.mock("@/lib/webgl", () => ({
  detectWebGLSupport: () => ({ supported: true, reason: null }),
}));

vi.mock("maplibre-gl", () => {
  class Map {
    constructor() {
      throw new Error("Failed to initialize WebGL");
    }
  }
  return {
    default: { Map, Marker: class {}, NavigationControl: class {}, ScaleControl: class {} },
    Map,
  };
});

import { WaterAtlasMap } from "@/components/map/WaterAtlasMap";
import { WorkspaceProvider } from "@/lib/workspace";

describe("WaterAtlasMap constructor failure", () => {
  it("renders the fallback when the map engine throws during construction", () => {
    expect(() =>
      render(
        <WorkspaceProvider>
          <WaterAtlasMap />
        </WorkspaceProvider>,
      ),
    ).not.toThrow();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Interactive map unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Failed to initialize WebGL/)).toBeInTheDocument();
  });
});
