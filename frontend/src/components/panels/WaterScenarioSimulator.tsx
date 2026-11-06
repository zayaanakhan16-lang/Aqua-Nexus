"use client";

/**
 * Scenario simulator for the planning surface.
 *
 * The AgriSense planning workspace lets you change an assumption and watch a
 * computed result move. This is the water equivalent: the sliders change
 * abstraction assumptions, and the chart shows the resulting monthly balance.
 *
 * It is an *arithmetic* surface, not a second rules engine. The only measured
 * input is the rainfall series the providers returned; everything else is a
 * number the user set. When no rainfall series is available the simulator shows
 * an explicit unavailable state and draws no bars, because a balance computed
 * from an absent series would be a fabricated reading.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { CHART_CHROME, PALETTE, chartTooltip } from "@/lib/palette";
import {
  DEFAULT_ASSUMPTIONS,
  computeScenario,
  monthlyRainfall,
  type ScenarioAssumptions,
} from "@/lib/water-scenario";
import { Info, RotateCcw, SlidersHorizontal } from "lucide-react";

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
    label: "Crop water requirement",
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
    hint: "Share of measured rainfall assumed to reach storage.",
  },
];

const MM = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const M3 = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

export function WaterScenarioSimulator({
  history,
  areaKm2,
}: {
  history: SliceState<PrecipitationSeries>;
  areaKm2: number | null;
}) {
  const [assumptions, setAssumptions] = useState<ScenarioAssumptions>(DEFAULT_ASSUMPTIONS);

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
    () => computeScenario({ rainfallByMonth, areaKm2, assumptions }),
    [rainfallByMonth, areaKm2, assumptions],
  );

  const set = (key: keyof ScenarioAssumptions, value: number): void =>
    setAssumptions((prev) => ({ ...prev, [key]: value }));

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Scenario simulator"
        subtitle="Change the assumptions to see how the monthly balance moves"
        icon={<SlidersHorizontal className="h-4 w-4" aria-hidden />}
      />
      <div className="space-y-4 p-4">
        <div className="flex items-start gap-2 rounded-lg border border-signal-caution/25 bg-signal-caution/[0.06] px-3 py-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-signal-caution" aria-hidden />
          <p className="text-xs leading-relaxed text-ink-200">
            Illustrative scenario. The rainfall totals are measured — they are the last twelve
            months of daily rainfall returned for this location. Everything else on this panel is
            an assumption you set, so the balance is a calculation, not an observation. It is a
            planning prompt, not engineering advice.
          </p>
        </div>

        {!scenario.hasRainfall ? (
          <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-4">
            <p className="text-sm font-medium text-ink-100">No rainfall series available</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-300">
              {history.loading
                ? "The measured rainfall series for this location is still loading."
                : "No measured daily rainfall was returned for this location, so no balance can be computed. Rather than assume a value, the simulator shows nothing until a measured series is available."}
            </p>
          </div>
        ) : (
          <>
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

            <div className="flex flex-wrap items-center justify-between gap-2">
              <dl className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <Summary label="Annual supply" mm={scenario.annualSupplyMm} m3={scenario.annualSupplyM3} />
                <Summary label="Annual demand" mm={scenario.annualDemandMm} m3={scenario.annualDemandM3} />
                <Summary
                  label="Annual balance"
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
                onClick={() => setAssumptions(DEFAULT_ASSUMPTIONS)}
                className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-2xs text-ink-300 transition hover:text-ink-50"
              >
                <RotateCcw className="h-3 w-3" aria-hidden />
                Reset assumptions
              </button>
            </div>

            <BalanceChart scenario={scenario} />

            <p className="text-3xs leading-relaxed text-ink-500">
              {areaKm2 != null
                ? `Volumes use the selected region's ${MM.format(areaKm2)} km² area. `
                : "Region area is not recorded, so the comparison is shown in millimetres only. "}
              Bars show measured monthly rainfall against assumed demand; the net line is supply
              minus demand.
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
    tone === "deficit" ? "text-signal-caution" : tone === "surplus" ? "text-teal-400" : "text-ink-100";
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
 * Monthly rainfall bars with a net-balance line over them.
 *
 * Drawn with ECharts to match every other chart in the product, including its
 * tooltip treatment, so the planning surface does not introduce a second chart
 * idiom.
 */
function BalanceChart({ scenario }: { scenario: ReturnType<typeof computeScenario> }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<import("echarts").ECharts | null>(null);

  const option = useMemo(() => {
    const months = scenario.months;
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
          return [
            `<strong>${m.label}</strong>`,
            m.rainfallMm === null ? "Rainfall: not recorded" : `Rainfall: ${m.rainfallMm.toFixed(1)} mm`,
            m.supplyMm === null ? "Captured: —" : `Captured: ${m.supplyMm.toFixed(1)} mm`,
            m.demandMm === null ? "Demand: —" : `Demand: ${m.demandMm.toFixed(1)} mm`,
            m.netMm === null ? "Net: —" : `Net: ${m.netMm.toFixed(1)} mm`,
          ].join("<br/>");
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
      series: [
        {
          name: "Captured supply",
          type: "bar" as const,
          stack: "balance",
          data: months.map((m) => m.supplyMm),
          itemStyle: { color: PALETTE.water300 },
        },
        {
          name: "Demand",
          type: "bar" as const,
          stack: "balance",
          data: months.map((m) => (m.demandMm === null ? null : -m.demandMm)),
          itemStyle: { color: PALETTE.viz8 },
        },
        {
          name: "Net",
          type: "line" as const,
          data: months.map((m) => m.netMm),
          symbolSize: 5,
          connectNulls: false,
          lineStyle: { color: PALETTE.teal400, width: 2 },
          itemStyle: { color: PALETTE.teal400 },
        },
      ],
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
      aria-label="Monthly captured rainfall against assumed demand, with the net balance"
    />
  );
}
