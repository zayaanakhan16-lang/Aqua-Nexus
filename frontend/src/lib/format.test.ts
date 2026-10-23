import { describe, expect, it } from "vitest";

import { classificationStyle, formatCoord, formatIndicatorValue, formatNumber, shiftDateYears } from "@/lib/format";

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

describe("formatIndicatorValue", () => {
  it("renders the wet-day fraction as a percentage without changing the value", () => {
    expect(formatIndicatorValue({ key: "wet_day_fraction", value: 0.633, unit: "ratio" })).toEqual({
      value: "63.3",
      unit: "%",
    });
  });

  it("never turns a multiplier ratio into a percentage", () => {
    // 1.0 means normal river flow; 100% would be wrong.
    expect(
      formatIndicatorValue({ key: "river_discharge_ratio", value: 1.0, unit: "ratio" }),
    ).toEqual({ value: "1.00", unit: "ratio" });
  });

  it("leaves percentage and other units untouched", () => {
    expect(
      formatIndicatorValue({ key: "rainfall_anomaly", value: -10.5, unit: "%" }),
    ).toEqual({ value: "-10.5", unit: "%" });
    expect(
      formatIndicatorValue({ key: "coverage", value: 93.3, unit: "%" }),
    ).toEqual({ value: "93.3", unit: "%" });
  });

  it("renders an em dash for a missing value", () => {
    expect(formatIndicatorValue({ key: "wet_day_fraction", value: null, unit: "ratio" })).toEqual({
      value: "—",
      unit: "ratio",
    });
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

describe("shiftDateYears", () => {
  it("shifts a normal date forward one year", () => {
    expect(shiftDateYears("2025-09-01", 1)).toBe("2026-09-01");
  });

  it("maps 29 Feb onto 28 Feb for a non-leap target year", () => {
    expect(shiftDateYears("2024-02-29", 1)).toBe("2025-02-28");
  });

  it("keeps 29 Feb when the target year is also a leap year", () => {
    expect(shiftDateYears("2024-02-29", 4)).toBe("2028-02-29");
  });

  it("returns the input unchanged when it is not a date", () => {
    expect(shiftDateYears("not-a-date", 1)).toBe("not-a-date");
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
