"use client";

/**
 * Water Region Digital Twin — the scenario surface for the planning section.
 *
 * The AgriSense planning workspace lets you change an assumption and watch a
 * computed result move. This is the water equivalent, with the observed /
 * simulated distinction made explicit rather than implied:
 *
 *   Observed   the measured rainfall series, restated. No assumption applied.
 *   Simulated  the same series with a scenario's assumptions applied.
 *
 * It is an *arithmetic* surface, not a second rules engine. The only measured
 * input is the rainfall series the providers returned; everything else is a
 * number the user set or a preset they chose. When no rainfall series is
 * available the simulator shows an explicit unavailable state and draws no
 * bars, because a balance computed from an absent series would be a fabricated
 * reading.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { CHART_CHROME, PALETTE, chartTooltip } from "@/lib/palette";
import {
  DEFAULT_ASSUMPTIONS,
  DEFAULT_PRESET_ID,
  SCENARIO_PRESETS,
  compareToBaseline,
  computeScenario,
  monthlyRainfall,
  presetById,
  type ScenarioAssumptions,
  type ScenarioComparisonRow,
} from "@/lib/water-scenario";
import { FlaskConical, Info, RotateCcw, SlidersHorizontal } from "lucide-react";

import { Panel, PanelHeader } from "@/components/ui/primitives";
import type { PrecipitationSeries } from "@/lib/schemas";
import type { SliceState } from "@/lib/workspace";

interface SliderSpec {
  key: keyof ScenarioAssumptions;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Renders the raw value for the readout. */
  format: (value: number) => string;
  hint: string;
}

const SLIDERS: SliderSpec[] = [
  {
    key: "irrigatedShare",
    label: "Irrigated share",
    min: 0,
    max: 1,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`,
    hint: "Share of the region assumed to be under irrigation.",
  },
  {
    key: "demandMmPerMonth",
    label: "Water requirement",
    min: 0,
    max: 200,
    step: 5,
    format: (v) => `${v} mm/month`,
    hint: "Water the irrigated area is assumed to need each month.",
  },
  {
    key: "distributionLossPct",
    label: "Distribution losses",
    min: 0,
    max: 60,
    step: 5,
    format: (v) => `${v}%`,
    hint: "Water lost in delivery, added on top of the requirement.",
  },
  {
    key: "capturePct",
    label: "Rainfall captured",
    min: 0,
    max: 100,
    step: 5,
    format: (v) => `${v}%`,
    hint: "Share of scenario rainfall assumed to reach storage.",
  },
];

const MM = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const M3 = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

/**
 * The label every simulated figure carries. Kept as one constant so the wording
 * cannot drift between the header, the readouts and the chart.
 */
const SIMULATION_BADGE = "SIMULATION — NOT A REAL OBSERVATION";

export function WaterScenarioSimulator({
  history,
  areaKm2,
}: {
  history: SliceState<PrecipitationSeries>;
  areaKm2: number | null;
}) {
  const [presetId, setPresetId] = useState<string>(DEFAULT_PRESET_ID);
  const [assumptions, setAssumptions] = useState<ScenarioAssumptions>(DEFAULT_ASSUMPTIONS);

  const preset = presetById(presetId);
  // "Observed" is the preset that leaves the measurement untouched. Choosing it
  // is what puts the surface back into observed mode; any other preset (or any
  // slider move) makes the result a scenario.
  const observed = preset.rainfallFactor === 1 && presetId === "observed";
  const assumptionsDirty =
    assumptions.irrigatedShare !== preset.assumptions.irrigatedShare ||
    assumptions.demandMmPerMonth !== preset.assumptions.demandMmPerMonth ||
    assumptions.distributionLossPct !== preset.assumptions.distributionLossPct ||
    assumptions.capturePct !== preset.assumptions.capturePct;

  const rainfallByMonth = useMemo(
    () =>
      monthlyRainfall(
        (history.data?.points ?? []).map((p) => ({
          date: p.timestamp.slice(0, 10),
          precipitation_sum_mm: p.value,
        })),
      ),
    [history.data],
  );

  const scenario = useMemo(
    () =>
      computeScenario({
        rainfallByMonth,
        areaKm2,
        assumptions,
        rainfallFactor: preset.rainfallFactor,
      }),
    [rainfallByMonth, areaKm2, assumptions, preset.rainfallFactor],
  );

  const comparison = useMemo(
    () =>
      compareToBaseline({
        rainfallByMonth,
        areaKm2,
        assumptions,
        rainfallFactor: preset.rainfallFactor,
      }),
    [rainfallByMonth, areaKm2, assumptions, preset.rainfallFactor],
  );

  const set = (key: keyof ScenarioAssumptions, value: number): void =>
    setAssumptions((prev) => ({ ...prev, [key]: value }));

  const choosePreset = (id: string): void => {
    const next = presetById(id);
    setPresetId(id);
    setAssumptions(next.assumptions);
  };

  const reset = (): void => {
    setPresetId(DEFAULT_PRESET_ID);
    setAssumptions(DEFAULT_ASSUMPTIONS);
  };

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Water region digital twin"
        subtitle="Explore how this region's balance responds to different conditions"
        icon={<SlidersHorizontal className="h-4 w-4" aria-hidden />}
      />
      <div className="space-y-4 p-4">
        {/* -------------------------------------------------- mode + honesty */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="Simulation mode"
            className="inline-flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-0.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={observed}
              onClick={() => choosePreset("observed")}
              className={
                observed
                  ? "rounded-md bg-ink-100 px-2.5 py-1 text-2xs font-semibold text-abyss-950"
                  : "rounded-md px-2.5 py-1 text-2xs font-medium text-ink-300 transition hover:text-ink-50"
              }
            >
              Observed
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!observed}
              onClick={() => choosePreset("drought")}
              className={
                !observed
                  ? "rounded-md bg-ink-100 px-2.5 py-1 text-2xs font-semibold text-abyss-950"
                  : "rounded-md px-2.5 py-1 text-2xs font-medium text-ink-300 transition hover:text-ink-50"
              }
            >
              Simulated
            </button>
          </div>

          {observed ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-water-300/35 bg-water-300/10 px-2 py-1 text-3xs font-semibold uppercase tracking-[0.08em] text-water-200">
              Observed rainfall — no assumption applied
            </span>
          ) : (
            <span
              data-testid="simulation-badge"
              className="inline-flex items-center gap-1.5 rounded-md border border-signal-caution/40 bg-signal-caution/[0.12] px-2 py-1 text-3xs font-semibold uppercase tracking-[0.08em] text-signal-caution"
            >
              <FlaskConical className="h-3 w-3" aria-hidden />
              {SIMULATION_BADGE}
            </span>
          )}
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-water-300" aria-hidden />
          <p className="text-xs leading-relaxed text-ink-200">
            {observed
              ? "The rainfall totals are measured — the last twelve months of daily rainfall returned for this location. The demand figures are assumptions you set, so the balance is a calculation, not an observation."
              : "Every figure below is a scenario output. The rainfall series is measured, but the scenario multiplier and the demand assumptions are yours, so nothing here is an observation or a forecast of what will happen."}
          </p>
        </div>

        {!scenario.hasRainfall ? (
          <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-4">
            <p className="text-sm font-medium text-ink-100">No rainfall series available</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-300">
              {history.loading
                ? "The measured rainfall series for this location is still loading."
                : "No measured daily rainfall was returned for this location, so no balance can be computed. Rather than assume a value, the digital twin shows nothing until a measured series is available."}
            </p>
          </div>
        ) : (
          <>
            {/* ------------------------------------------------ scenario presets */}
            <div>
              <span className="label-caps">Scenario</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {SCENARIO_PRESETS.map((option) => {
                  const active = option.id === presetId;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => choosePreset(option.id)}
                      aria-pressed={active}
                      title={option.description}
                      className={
                        active
                          ? "rounded-md border border-water-300/45 bg-water-300/15 px-2 py-1 text-2xs font-medium text-water-200"
                          : "rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-2xs font-medium text-ink-300 transition hover:text-ink-100"
                      }
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-3xs leading-relaxed text-ink-500">{preset.description}</p>
            </div>

            {/* ------------------------------------------------------- sliders */}
            <div className="grid gap-3 sm:grid-cols-2">
              {SLIDERS.map((spec) => (
                <label key={spec.key} className="block">
                  <span className="flex items-center justify-between gap-2">
                    <span className="label-caps">{spec.label}</span>
                    <span className="font-mono text-2xs tabular-nums text-water-200">
                      {spec.format(assumptions[spec.key])}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={spec.min}
                    max={spec.max}
                    step={spec.step}
                    value={assumptions[spec.key]}
                    onChange={(e) => set(spec.key, Number(e.target.value))}
                    className="mt-1.5 w-full accent-water-300"
                    aria-label={spec.label}
                    aria-describedby={`${spec.key}-hint`}
                  />
                  <span id={`${spec.key}-hint`} className="mt-0.5 block text-3xs text-ink-500">
                    {spec.hint}
                  </span>
                </label>
              ))}
            </div>

            {/* ------------------------------------------------------ readouts */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dl className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <Summary
                  label={observed ? "Annual supply" : "Simulated supply"}
                  mm={scenario.annualSupplyMm}
                  m3={scenario.annualSupplyM3}
                />
                <Summary
                  label="Annual demand"
                  mm={scenario.annualDemandMm}
                  m3={scenario.annualDemandM3}
                />
                <Summary
                  label={observed ? "Annual balance" : "Simulated balance"}
                  mm={scenario.annualNetMm}
                  m3={scenario.annualNetM3}
                  tone={(scenario.annualNetMm ?? 0) < 0 ? "deficit" : "surplus"}
                />
                <div>
                  <dt className="label-caps">Deficit months</dt>
                  <dd className="font-mono text-sm tabular-nums text-ink-100">
                    {scenario.deficitMonths}
                    <span className="text-ink-500"> / {scenario.coveredMonths}</span>
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={reset}
                className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-2xs text-ink-300 transition hover:text-ink-50"
              >
                <RotateCcw className="h-3 w-3" aria-hidden />
                Reset scenario
              </button>
            </div>

            {assumptionsDirty ? (
              <p className="text-3xs leading-relaxed text-signal-caution">
                Assumptions differ from the “{preset.label}” preset — this is a custom scenario.
              </p>
            ) : null}

            <BalanceChart scenario={scenario} simulated={!observed} />

            {/* --------------------------------------------------- comparison */}
            <Comparison rows={comparison} simulated={!observed} />

            <p className="text-3xs leading-relaxed text-ink-500">
              {areaKm2 != null
                ? `Volumes use the selected region's ${MM.format(areaKm2)} km² area. `
                : "Region area is not recorded, so the comparison is shown in millimetres only. "}
              Bars show monthly rainfall against assumed demand; the net line is supply minus
              demand.
            </p>
          </>
        )}
      </div>
    </Panel>
  );
}

function Summary({
  label,
  mm,
  m3,
  tone,
}: {
  label: string;
  mm: number | null;
  m3: number | null;
  tone?: "surplus" | "deficit";
}) {
  const color =
    tone === "deficit"
      ? "text-signal-caution"
      : tone === "surplus"
        ? "text-teal-400"
        : "text-ink-100";
  // Volume is the more useful figure, but it needs a drawn region. Falling back
  // to the depth keeps the readout populated without inventing an area.
  const text = m3 !== null ? `${M3.format(m3)} m³` : mm !== null ? `${MM.format(mm)} mm` : "—";
  return (
    <div>
      <dt className="label-caps">{label}</dt>
      <dd className={`font-mono text-sm tabular-nums ${color}`}>{text}</dd>
    </div>
  );
}

/**
 * Baseline-versus-scenario comparison.
 *
 * Both columns come from the same measured series, so the difference is
 * entirely the scenario's assumptions. When there is no rainfall both sides are
 * null and the table says so rather than printing a zero delta.
 */
function Comparison({
  rows,
  simulated,
}: {
  rows: ScenarioComparisonRow[];
  simulated: boolean;
}) {
  const baseline = rows[0]!;
  const selected = rows[1]!;
  const comparable = baseline.annualNetMm !== null && selected.annualNetMm !== null;
  const deltaNet = comparable ? selected.annualNetMm! - baseline.annualNetMm! : null;

  const fmt = (value: number | null): string => (value === null ? "—" : `${MM.format(value)} mm`);

  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="label-caps">Scenario comparison</span>
        {simulated ? (
          <span className="text-3xs font-semibold uppercase tracking-[0.08em] text-signal-caution">
            Simulated
          </span>
        ) : null}
      </div>

      {!comparable ? (
        <p className="mt-1.5 text-3xs leading-relaxed text-ink-400">
          A comparison needs a measured rainfall series. None was returned for this location, so
          there is nothing to compare against.
        </p>
      ) : (
        <table className="mt-2 w-full border-collapse text-2xs">
          <caption className="sr-only">
            Annual water balance for the baseline and the selected scenario
          </caption>
          <thead>
            <tr className="text-left text-3xs uppercase tracking-[0.08em] text-ink-500">
              <th scope="col" className="pb-1 font-medium">
                Measure
              </th>
              <th scope="col" className="pb-1 text-right font-medium">
                Baseline
              </th>
              <th scope="col" className="pb-1 text-right font-medium">
                Scenario
              </th>
            </tr>
          </thead>
          <tbody className="text-ink-200">
            <tr className="border-t border-white/[0.06]">
              <th scope="row" className="py-1.5 text-left font-normal text-ink-300">
                Supply
              </th>
              <td className="py-1.5 text-right font-mono tabular-nums">
                {fmt(baseline.annualSupplyMm)}
              </td>
              <td className="py-1.5 text-right font-mono tabular-nums">
                {fmt(selected.annualSupplyMm)}
              </td>
            </tr>
            <tr className="border-t border-white/[0.06]">
              <th scope="row" className="py-1.5 text-left font-normal text-ink-300">
                Demand
              </th>
              <td className="py-1.5 text-right font-mono tabular-nums">
                {fmt(baseline.annualDemandMm)}
              </td>
              <td className="py-1.5 text-right font-mono tabular-nums">
                {fmt(selected.annualDemandMm)}
              </td>
            </tr>
            <tr className="border-t border-white/[0.06]">
              <th scope="row" className="py-1.5 text-left font-normal text-ink-300">
                Net balance
              </th>
              <td className="py-1.5 text-right font-mono tabular-nums">
                {fmt(baseline.annualNetMm)}
              </td>
              <td
                className={`py-1.5 text-right font-mono tabular-nums ${
                  (selected.annualNetMm ?? 0) < 0 ? "text-signal-caution" : "text-teal-400"
                }`}
              >
                {fmt(selected.annualNetMm)}
              </td>
            </tr>
            <tr className="border-t border-white/[0.06]">
              <th scope="row" className="py-1.5 text-left font-normal text-ink-300">
                Deficit months
              </th>
              <td className="py-1.5 text-right font-mono tabular-nums">
                {baseline.deficitMonths} / {baseline.coveredMonths}
              </td>
              <td className="py-1.5 text-right font-mono tabular-nums">
                {selected.deficitMonths} / {selected.coveredMonths}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {deltaNet !== null ? (
        <p className="mt-2 border-t border-white/[0.06] pt-2 text-3xs leading-relaxed text-ink-400">
          The scenario changes the annual net balance by{" "}
          <span
            className={`font-mono tabular-nums ${
              deltaNet < 0 ? "text-signal-caution" : "text-teal-400"
            }`}
          >
            {deltaNet >= 0 ? "+" : "−"}
            {MM.format(Math.abs(deltaNet))} mm
          </span>{" "}
          against the observed-rainfall baseline. Both columns use the same measured series.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Monthly rainfall bars with a net-balance line over them.
 *
 * Drawn with ECharts to match every other chart in the product, including its
 * tooltip treatment, so the planning surface does not introduce a second chart
 * idiom. The measured series is drawn alongside the scenario bars whenever the
 * two differ, so a scaled scenario is visibly an assumption and not a reading.
 */
function BalanceChart({
  scenario,
  simulated,
}: {
  scenario: ReturnType<typeof computeScenario>;
  simulated: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<import("echarts").ECharts | null>(null);

  const option = useMemo(() => {
    const months = scenario.months;
    const scaling = months.some(
      (m) => m.measuredRainfallMm !== null && m.measuredRainfallMm !== m.rainfallMm,
    );

    const series: Record<string, unknown>[] = [
      {
        name: "Captured supply",
        type: "bar",
        stack: "balance",
        data: months.map((m) => m.supplyMm),
        itemStyle: { color: PALETTE.water300 },
      },
      {
        name: "Demand",
        type: "bar",
        stack: "balance",
        data: months.map((m) => (m.demandMm === null ? null : -m.demandMm)),
        itemStyle: { color: PALETTE.viz8 },
      },
    ];

    // Only shown when the scenario actually scales the measurement — otherwise
    // it would sit exactly under the supply bars and add nothing.
    if (scaling) {
      series.push({
        name: "Measured rainfall",
        type: "line",
        data: months.map((m) => m.measuredRainfallMm),
        symbolSize: 3,
        connectNulls: false,
        lineStyle: { color: PALETTE.ink400, width: 1.5, type: "dashed" },
        itemStyle: { color: PALETTE.ink400 },
      });
    }

    series.push({
      name: "Net",
      type: "line",
      data: months.map((m) => m.netMm),
      symbolSize: 5,
      connectNulls: false,
      lineStyle: { color: PALETTE.teal400, width: 2 },
      itemStyle: { color: PALETTE.teal400 },
    });

    return {
      animation: false,
      grid: { left: 44, right: 16, top: 24, bottom: 26 },
      tooltip: {
        trigger: "axis" as const,
        ...chartTooltip(),
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? params : [params];
          const idx = (list[0] as { dataIndex: number }).dataIndex;
          const m = months[idx]!;
          const rows = [`<strong>${m.label}</strong>`];
          if (m.measuredRainfallMm !== null) {
            rows.push(`Measured rainfall: ${m.measuredRainfallMm.toFixed(1)} mm`);
          }
          if (m.rainfallMm !== null && m.rainfallMm !== m.measuredRainfallMm) {
            rows.push(`Scenario rainfall: ${m.rainfallMm.toFixed(1)} mm`);
          }
          rows.push(
            m.supplyMm === null ? "Captured: —" : `Captured: ${m.supplyMm.toFixed(1)} mm`,
            m.demandMm === null ? "Demand: —" : `Demand: ${m.demandMm.toFixed(1)} mm`,
            m.netMm === null ? "Net: —" : `Net: ${m.netMm.toFixed(1)} mm`,
          );
          return rows.join("<br/>");
        },
      },
      xAxis: {
        type: "category" as const,
        data: months.map((m) => m.label.slice(0, 3)),
        axisLine: { lineStyle: { color: CHART_CHROME.grid } },
        axisLabel: { color: CHART_CHROME.axis, fontSize: CHART_CHROME.axisFontSize },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value" as const,
        name: "mm",
        nameTextStyle: { color: CHART_CHROME.axis, fontSize: CHART_CHROME.axisFontSize },
        splitLine: { lineStyle: { color: CHART_CHROME.grid } },
        axisLabel: { color: CHART_CHROME.axis, fontSize: CHART_CHROME.axisFontSize },
      },
      series,
    };
  }, [scenario]);

  useEffect(() => {
    let disposed = false;
    if (!containerRef.current) return;
    void import("echarts").then((echarts) => {
      if (disposed || !containerRef.current) return;
      if (!chartRef.current) {
        chartRef.current = echarts.init(containerRef.current, undefined, { renderer: "canvas" });
      }
      chartRef.current.setOption(option, true);
    });
    const onResize = (): void => chartRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
    };
  }, [option]);

  useEffect(
    () => () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    },
    [],
  );

  return (
    <div
      ref={containerRef}
      className="h-56 w-full"
      role="img"
      aria-label={
        simulated
          ? "Simulated monthly captured rainfall against assumed demand, with the net balance"
          : "Monthly captured rainfall against assumed demand, with the net balance"
      }
    />
  );
}
