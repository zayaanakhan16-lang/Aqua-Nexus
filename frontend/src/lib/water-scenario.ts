/**
 * Water-balance scenario arithmetic for the planning surface.
 *
 * This is deliberately *not* a second rules engine. It does no inference, holds
 * no reference dataset and reaches no conclusion of its own: it applies
 * arithmetic to two things the user can see — a measured rainfall series the
 * providers actually returned, and assumptions the user set on the sliders.
 * Every output is therefore traceable to one of those two inputs, which is what
 * lets the surface label it honestly as an illustrative scenario.
 *
 * When rainfall is unavailable the result carries no numbers at all rather than
 * substituting a default, so a missing series can never be read as a balance.
 */

export const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Millimetres spread over one square kilometre, expressed as cubic metres. */
const MM_KM2_TO_M3 = 1000;

export interface ScenarioAssumptions {
  /** Share of the region under irrigation, 0–1. */
  irrigatedShare: number;
  /** Crop water requirement over the irrigated area, mm per month. */
  demandMmPerMonth: number;
  /** Distribution losses, as a percentage of delivered water, 0–60. */
  distributionLossPct: number;
  /** Share of rainfall captured for storage, 0–100. */
  capturePct: number;
}

export const DEFAULT_ASSUMPTIONS: ScenarioAssumptions = {
  irrigatedShare: 0.2,
  demandMmPerMonth: 60,
  distributionLossPct: 15,
  capturePct: 30,
};

export interface ScenarioMonth {
  month: number;
  label: string;
  /** Measured rainfall for this month, or null when the series is missing it. */
  rainfallMm: number | null;
  /** Captured rainfall, in mm over the whole region. */
  supplyMm: number | null;
  /** Gross demand over the whole region, in mm (losses included). */
  demandMm: number | null;
  /** supply − demand, in mm. Negative means the month is short. */
  netMm: number | null;
  supplyM3: number | null;
  demandM3: number | null;
  netM3: number | null;
}

export interface ScenarioResult {
  months: ScenarioMonth[];
  /** Annual totals as a depth over the whole region — always available. */
  annualSupplyMm: number | null;
  annualDemandMm: number | null;
  annualNetMm: number | null;
  /** Annual totals as volumes — null unless the region area is known. */
  annualSupplyM3: number | null;
  annualDemandM3: number | null;
  annualNetM3: number | null;
  /** Months whose measured rainfall fell short of demand. */
  deficitMonths: number;
  /** Months the rainfall series actually covered. */
  coveredMonths: number;
  /** False when no month had rainfall, so callers can show an unavailable state. */
  hasRainfall: boolean;
}

/**
 * Aggregate a daily rainfall series into twelve monthly totals.
 *
 * Days whose precipitation is null are skipped rather than counted as zero:
 * treating an absent reading as no rain would understate the total. A month with
 * no usable day at all stays null.
 */
export function monthlyRainfall(
  daily: ReadonlyArray<{ date: string; precipitation_sum_mm?: number | null }>,
): Array<number | null> {
  const sums = new Array<number>(12).fill(0);
  const counts = new Array<number>(12).fill(0);

  for (const day of daily) {
    const month = Number(day.date.slice(5, 7));
    if (!Number.isInteger(month) || month < 1 || month > 12) continue;
    const value = day.precipitation_sum_mm;
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    sums[month - 1]! += value;
    counts[month - 1]! += 1;
  }

  return sums.map((sum, i) => (counts[i]! > 0 ? sum : null));
}

/**
 * Apply the assumptions to a monthly rainfall series.
 *
 * Supply and demand are both expressed as millimetres over the *whole* region,
 * so they are directly comparable: demand covers only the irrigated share, and
 * losses are grossed up on top of it.
 */
export function computeScenario({
  rainfallByMonth,
  areaKm2,
  assumptions,
}: {
  rainfallByMonth: ReadonlyArray<number | null>;
  areaKm2: number | null;
  assumptions: ScenarioAssumptions;
}): ScenarioResult {
  const area = areaKm2 && areaKm2 > 0 ? areaKm2 : null;
  const lossFactor = Math.max(0, 1 - assumptions.distributionLossPct / 100);
  const grossDemandMm =
    lossFactor > 0
      ? (assumptions.demandMmPerMonth * assumptions.irrigatedShare) / lossFactor
      : null;

  const toM3 = (mm: number): number | null => (area === null ? null : mm * area * MM_KM2_TO_M3);

  const months: ScenarioMonth[] = MONTH_LABELS.map((label, i) => {
    const rainfall = rainfallByMonth[i] ?? null;
    const supplyMm = rainfall === null ? null : (rainfall * assumptions.capturePct) / 100;
    const demandMm = grossDemandMm;
    const netMm = supplyMm === null || demandMm === null ? null : supplyMm - demandMm;

    return {
      month: i + 1,
      label,
      rainfallMm: rainfall,
      supplyMm,
      demandMm,
      netMm,
      supplyM3: supplyMm === null ? null : toM3(supplyMm),
      demandM3: demandMm === null ? null : toM3(demandMm),
      netM3: netMm === null ? null : toM3(netMm),
    };
  });

  const covered = months.filter((m) => m.rainfallMm !== null);
  const sum = (pick: (m: ScenarioMonth) => number | null): number | null => {
    if (!covered.length) return null;
    return covered.reduce((acc, m) => acc + (pick(m) ?? 0), 0);
  };

  const totalSupplyMm = sum((m) => m.supplyMm);
  const totalDemandMm = sum((m) => m.demandMm);
  const annualSupplyM3 = area === null || totalSupplyMm === null ? null : toM3(totalSupplyMm);
  const annualDemandM3 = area === null || totalDemandMm === null ? null : toM3(totalDemandMm);

  return {
    months,
    annualSupplyMm: totalSupplyMm,
    annualDemandMm: totalDemandMm,
    annualNetMm:
      totalSupplyMm === null || totalDemandMm === null ? null : totalSupplyMm - totalDemandMm,
    annualSupplyM3,
    annualDemandM3,
    annualNetM3:
      annualSupplyM3 === null || annualDemandM3 === null
        ? null
        : annualSupplyM3 - annualDemandM3,
    deficitMonths: covered.filter((m) => (m.netMm ?? 0) < 0).length,
    coveredMonths: covered.length,
    hasRainfall: covered.length > 0,
  };
}
