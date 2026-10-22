import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RasterMap } from "@/components/map/RasterMap";

// jsdom has no layout: every element reports a zero box, so the map would render
// no tiles. Give all elements a real viewport before rendering so the component's
// initial measurement succeeds.
const WIDTH = 640;
const HEIGHT = 480;
Object.defineProperty(HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get: () => WIDTH,
});
Object.defineProperty(HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get: () => HEIGHT,
});
Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
  configurable: true,
  value: () => ({
    left: 0,
    top: 0,
    width: WIDTH,
    height: HEIGHT,
    right: WIDTH,
    bottom: HEIGHT,
    x: 0,
    y: 0,
  }),
});

describe("RasterMap (non-WebGL fallback)", () => {
  it("renders real raster tiles without any WebGL context", () => {
    const { container } = render(<RasterMap location={null} onSelect={vi.fn()} />);
    const images = container.querySelectorAll("img");
    expect(images.length).toBeGreaterThan(0);
    // Tiles come from a real tile server, not a decorative pattern.
    const src = images[0]!.getAttribute("src") ?? "";
    expect(src).toMatch(/^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/);
  });

  it("exposes zoom controls and reports the zoom level", () => {
    render(<RasterMap location={null} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /zoom in/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /zoom out/i })).toBeInTheDocument();

    const before = screen.getByText(/^z\d+$/).textContent;
    fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));
    expect(screen.getByText(/^z\d+$/).textContent).not.toBe(before);
  });

  it("selects a coordinate when the map is clicked", () => {
    const onSelect = vi.fn();
    const { container } = render(<RasterMap location={null} onSelect={onSelect} />);
    fireEvent.click(container.firstElementChild as HTMLElement, {
      clientX: 320,
      clientY: 240,
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    const [lat, lon] = onSelect.mock.calls[0]!;
    expect(typeof lat).toBe("number");
    expect(typeof lon).toBe("number");
    expect(lat).toBeGreaterThanOrEqual(-90);
    expect(lat).toBeLessThanOrEqual(90);
    expect(lon).toBeGreaterThanOrEqual(-180);
    expect(lon).toBeLessThanOrEqual(180);
  });

  it("marks the selected location", () => {
    const { container } = render(
      <RasterMap location={{ latitude: 6.45, longitude: 3.39 }} onSelect={vi.fn()} />,
    );
    expect(container.querySelector(".aquanexus-marker")).not.toBeNull();
  });

  it("draws satellite footprints only when enabled and provided", () => {
    const scenes = [
      {
        id: "SCENE1",
        collection: "sentinel-2-l2a",
        bbox: [3.3, 6.4, 3.5, 6.5],
      },
    ];
    const { container, rerender } = render(
      <RasterMap location={null} onSelect={vi.fn()} scenes={scenes} showScenes={false} />,
    );
    expect(container.querySelectorAll(".aquanexus-scene-footprint").length).toBe(0);

    rerender(<RasterMap location={null} onSelect={vi.fn()} scenes={scenes} showScenes />);
    expect(container.querySelectorAll(".aquanexus-scene-footprint").length).toBe(1);
  });
});
