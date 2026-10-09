import { describe, expect, it } from "vitest";

import { classificationStyle, formatCoord, formatNumber } from "@/lib/format";

describe("formatNumber", () => {
  it("formats with fixed digits", () => {
    expect(formatNumber(12.345, 1)).toBe("12.3");
  });

  it("renders an em dash for null", () => {
    expect(formatNumber(null)).toBe("—");
  });

  it("renders an em dash for undefined", () => {
    expect(formatNumber(undefined)).toBe("—");
  });

  it("renders an em dash for NaN", () => {
    expect(formatNumber(Number.NaN)).toBe("—");
  });
});

describe("formatCoord", () => {
  it("labels northern/eastern hemispheres", () => {
    expect(formatCoord(52.5, "lat")).toBe("52.5000° N");
    expect(formatCoord(13.4, "lon")).toBe("13.4000° E");
  });

  it("labels southern/western hemispheres", () => {
    expect(formatCoord(-33.86, "lat")).toBe("33.8600° S");
    expect(formatCoord(-70.66, "lon")).toBe("70.6600° W");
  });
});

describe("classificationStyle", () => {
  it("provides a distinct style per classification", () => {
    const observed = classificationStyle("observation");
    const forecast = classificationStyle("forecast");
    expect(observed.label).toBe("Direct observation");
    expect(forecast.label).toBe("Forecast");
    expect(observed.className).not.toBe(forecast.className);
  });

  it("never labels a forecast as an observation", () => {
    expect(classificationStyle("forecast").label).not.toMatch(/observ/i);
  });
});
