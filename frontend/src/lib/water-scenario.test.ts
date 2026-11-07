import { describe, expect, it } from "vitest";

import {
  DEFAULT_ASSUMPTIONS,
  DEFAULT_PRESET_ID,
  SCENARIO_PRESETS,
  compareToBaseline,
  computeScenario,
  monthlyRainfall,
  presetById,
} from "@/lib/water-scenario";

/**
 * The scenario arithmetic is the one place in the planning surface that
 * produces numbers, so its honesty rules are pinned here:
 *
 * 1. A missing reading is skipped, never counted as zero.
 * 2. When rainfall is unavailable the result carries no numbers at all.
 * 3. Supply and demand are comparable, so a deficit month is a real comparison
 *    and not an artefact of different units.
 */
describe("monthlyRainfall", () => {
  it("totals each month from the daily series", () => {
    const totals = monthlyRainfall([
      { date: "2026-01-05", precipitation_sum_mm: 4 },
      { date: "2026-01-19", precipitation_sum_mm: 6 },
      { date: "2026-03-02", precipitation_sum_mm: 12 },
    ]);
    expect(totals[0]).toBe(10);
    expect(totals[2]).toBe(12);
  });

  it("leaves a month with no usable day null rather than zero", () => {
    const totals = monthlyRainfall([{ date: "2026-01-05", precipitation_sum_mm: 4 }]);
    expect(totals[1]).toBeNull();
  });

  it("skips null readings instead of treating them as no rain", () => {
    const totals = monthlyRainfall([
      { date: "2026-02-01", precipitation_sum_mm: null },
      { date: "2026-02-02", precipitation_sum_mm: 8 },
    ]);
    expect(totals[1]).toBe(8);
  });

  it("ignores malformed dates", () => {
    const totals = monthlyRainfall([{ date: "not-a-date", precipitation_sum_mm: 5 }]);
    expect(totals.every((m) => m === null)).toBe(true);
  });
});

describe("computeScenario", () => {
  const rain = new Array<number | null>(12).fill(100);
  rain[6] = 0;

  it("compares supply and demand in the same unit", () => {
    const result = computeScenario({
      rainfallByMonth: rain,
      areaKm2: 1,
      assumptions: { ...DEFAULT_ASSUMPTIONS, capturePct: 100, irrigatedShare: 1, demandMmPerMonth: 50, distributionLossPct: 0 },
    });
    // January: 100 mm captured, 50 mm demanded -> +50 mm net.
    expect(result.months[0]!.netMm).toBeCloseTo(50);
    // July: no rain, so the whole demand is a deficit.
    expect(result.months[6]!.netMm).toBeCloseTo(-50);
    expect(result.deficitMonths).toBe(1);
  });

  it("grosses demand up for distribution losses", () => {
    const result = computeScenario({
      rainfallByMonth: rain,
      areaKm2: 1,
      assumptions: { ...DEFAULT_ASSUMPTIONS, irrigatedShare: 1, demandMmPerMonth: 50, distributionLossPct: 50, capturePct: 0 },
    });
    // 50 mm delivered at 50% loss needs 100 mm abstracted.
    expect(result.months[0]!.demandMm).toBeCloseTo(100);
  });

  it("reports no numbers when the rainfall series is missing", () => {
    const result = computeScenario({
      rainfallByMonth: new Array<number | null>(12).fill(null),
      areaKm2: 10,
      assumptions: DEFAULT_ASSUMPTIONS,
    });
    expect(result.hasRainfall).toBe(false);
    expect(result.annualSupplyM3).toBeNull();
    expect(result.annualNetM3).toBeNull();
    expect(result.months.every((m) => m.netMm === null)).toBe(true);
  });

  it("leaves volumes null when the region area is unknown", () => {
    const result = computeScenario({
      rainfallByMonth: rain,
      areaKm2: null,
      assumptions: DEFAULT_ASSUMPTIONS,
    });
    // The millimetre comparison still works; only the volumetric form is absent.
    expect(result.months[0]!.netMm).not.toBeNull();
    expect(result.annualSupplyMm).not.toBeNull();
    expect(result.annualSupplyM3).toBeNull();
  });

  it("converts millimetres over an area into cubic metres", () => {
    const result = computeScenario({
      rainfallByMonth: [10, ...new Array<number | null>(11).fill(null)],
      areaKm2: 2,
      assumptions: { ...DEFAULT_ASSUMPTIONS, capturePct: 100, irrigatedShare: 0 },
    });
    // 10 mm over 2 km² = 10 * 2 * 1000 m³.
    expect(result.months[0]!.supplyM3).toBeCloseTo(20000);
  });

  it("leaves the measurement untouched when the rainfall factor is 1", () => {
    const result = computeScenario({
      rainfallByMonth: rain,
      areaKm2: 1,
      assumptions: DEFAULT_ASSUMPTIONS,
      rainfallFactor: 1,
    });
    expect(result.months[0]!.rainfallMm).toBe(result.months[0]!.measuredRainfallMm);
  });

  it("scales the scenario rainfall while keeping the measurement readable", () => {
    const result = computeScenario({
      rainfallByMonth: rain,
      areaKm2: 1,
      assumptions: DEFAULT_ASSUMPTIONS,
      rainfallFactor: 0.5,
    });
    // The scenario halves the month, but the measured value is still reported so
    // the surface can show that a scenario is in effect.
    expect(result.months[0]!.rainfallMm).toBeCloseTo(50);
    expect(result.months[0]!.measuredRainfallMm).toBeCloseTo(100);
  });

  it("ignores a negative or non-finite rainfall factor rather than inverting the series", () => {
    const result = computeScenario({
      rainfallByMonth: rain,
      areaKm2: 1,
      assumptions: DEFAULT_ASSUMPTIONS,
      rainfallFactor: -1,
    });
    expect(result.months[0]!.rainfallMm).toBeCloseTo(100);
  });
});

describe("compareToBaseline", () => {
  const rain = new Array<number | null>(12).fill(100);

  it("returns a baseline and a selected row computed from the same series", () => {
    const rows = compareToBaseline({
      rainfallByMonth: rain,
      areaKm2: 10,
      assumptions: { ...DEFAULT_ASSUMPTIONS, capturePct: 100, irrigatedShare: 0 },
      rainfallFactor: 0.5,
    });
    expect(rows).toHaveLength(2);
    // The baseline is the observed preset (30% capture), so it keeps the
    // measurement: 12 months x 100 mm x 30% = 360 mm. The scenario halves the
    // measured months and captures all of them: 12 x 50 x 100% = 600 mm.
    expect(rows[0]!.annualSupplyMm).toBeCloseTo(360);
    expect(rows[1]!.annualSupplyMm).toBeCloseTo(600);
  });

  it("carries nulls on both rows when there is no measured series", () => {
    const rows = compareToBaseline({
      rainfallByMonth: new Array<number | null>(12).fill(null),
      areaKm2: 10,
      assumptions: DEFAULT_ASSUMPTIONS,
      rainfallFactor: 1,
    });
    expect(rows.every((row) => row.annualNetMm === null)).toBe(true);
  });
});

describe("scenario presets", () => {
  it("names the unchanged-rainfall preset first so observed is the default", () => {
    expect(SCENARIO_PRESETS[0]!.id).toBe(DEFAULT_PRESET_ID);
    expect(SCENARIO_PRESETS[0]!.rainfallFactor).toBe(1);
  });

  it("gives every preset a unique id and a description", () => {
    const ids = SCENARIO_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of SCENARIO_PRESETS) {
      expect(preset.description.length).toBeGreaterThan(0);
      expect(preset.rainfallFactor).toBeGreaterThan(0);
    }
  });

  it("falls back to the observed preset for an unknown id", () => {
    expect(presetById("not-a-preset").id).toBe(DEFAULT_PRESET_ID);
  });
});
