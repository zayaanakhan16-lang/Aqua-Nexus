import { describe, expect, it } from "vitest";

import { parseCoordinates } from "@/lib/geo";

describe("parseCoordinates", () => {
  it("parses comma-separated coordinates", () => {
    expect(parseCoordinates("52.52, 13.40")).toEqual({ lat: 52.52, lon: 13.4 });
  });

  it("parses space-separated coordinates", () => {
    expect(parseCoordinates("-33.86 151.20")).toEqual({ lat: -33.86, lon: 151.2 });
  });

  it("parses integer coordinates", () => {
    expect(parseCoordinates("0, 0")).toEqual({ lat: 0, lon: 0 });
  });

  it("rejects out-of-range latitude", () => {
    expect(parseCoordinates("91.0, 10")).toBeNull();
  });

  it("rejects out-of-range longitude", () => {
    expect(parseCoordinates("10, -181")).toBeNull();
  });

  it("rejects non-numeric text", () => {
    expect(parseCoordinates("Berlin")).toBeNull();
  });

  it("rejects a single number", () => {
    expect(parseCoordinates("12.5")).toBeNull();
  });
});
