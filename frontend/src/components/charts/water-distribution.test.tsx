import { describe, expect, it } from "vitest";

import { distributionSlices } from "@/components/charts/WaterDistributionChart";
import type { WaterBodyResult } from "@/lib/schemas";

/**
 * The distribution donut groups mapped water features by kind. These tests pin
 * the honest-data contract of that grouping: it counts only features the backend
 * actually returned, it never invents a category, and it yields nothing (so the
 * panel can show an empty state) when there is no data.
 */

function result(bodies: WaterBodyResult["bodies"]): WaterBodyResult {
  return {
    location: { latitude: 6.44, longitude: 3.4 },
    radius_m: 15000,
    count: bodies.length,
    bodies,
    provider: {
      provider_id: "osm_overpass",
      provider_name: "OpenStreetMap water features",
      status: "ok",
      message: null,
      classification: "observation",
      preliminary: false,
    },
    note: "Mapped features from OpenStreetMap contributors.",
    service_reachable: true,
  } as WaterBodyResult;
}

function body(id: string, kind: string): WaterBodyResult["bodies"][number] {
  return {
    id,
    name: null,
    kind,
    coordinates: [],
    bbox: { west: 3.3, south: 6.4, east: 3.5, north: 6.5 },
    area_km2: null,
    tags: {},
    source_id: "osm_overpass",
  };
}

describe("distributionSlices", () => {
  it("returns nothing when there is no data or no bodies", () => {
    expect(distributionSlices(null)).toEqual([]);
    expect(distributionSlices(result([]))).toEqual([]);
  });

  it("counts each kind and orders largest first", () => {
    const slices = distributionSlices(
      result([
        body("way/1", "lake"),
        body("way/2", "river"),
        body("way/3", "lake"),
        body("way/4", "lake"),
        body("way/5", "reservoir"),
      ]),
    );
    expect(slices.map((s) => [s.kind, s.count])).toEqual([
      ["lake", 3],
      ["reservoir", 1],
      ["river", 1],
    ]);
    // Totals must equal the number of features actually returned.
    expect(slices.reduce((n, s) => n + s.count, 0)).toBe(5);
  });

  it("gives every slice a distinct colour and a human label", () => {
    const slices = distributionSlices(
      result([body("way/1", "lake"), body("way/2", "river"), body("way/3", "wetland")]),
    );
    expect(new Set(slices.map((s) => s.color)).size).toBe(slices.length);
    expect(slices.map((s) => s.label)).toContain("Lake");
  });

  it("keeps an unknown kind visible rather than dropping it", () => {
    // A kind the UI has no style for must still be counted, not silently lost,
    // otherwise the donut would understate what was mapped.
    const slices = distributionSlices(result([body("way/1", "spring"), body("way/2", "lake")]));
    const total = slices.reduce((n, s) => n + s.count, 0);
    expect(total).toBe(2);
    expect(slices.map((s) => s.kind)).toContain("spring");
  });
});
