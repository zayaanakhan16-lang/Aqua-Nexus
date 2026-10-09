"use client";

/**
 * Rainfall chart.
 *
 * Apache ECharts is imported dynamically so the charting library stays out of
 * the initial bundle. Observation, baseline and forecast are rendered as
 * visually distinct series — never merged — so provenance stays legible.
 */
import { useEffect, useMemo, useRef } from "react";

import type { PrecipitationComparison, PrecipitationSeries } from "@/lib/schemas";

interface RainfallChartProps {
  observed?: PrecipitationSeries | null;
  baseline?: PrecipitationSeries | null;
  forecast?: PrecipitationSeries | null;
  height?: number;
}

const COLOR = {
  observed: "#2cc0e4",
  baseline: "#8fa3b8",
  forecast: "#39d3b4",
  grid: "rgba(255,255,255,0.06)",
  axis: "#6f8399",
};

function seriesData(series: PrecipitationSeries | null | undefined): [string, number | null][] {
  if (!series) return [];
  return series.points.map((p) => [
    p.timestamp.slice(0, 10),
    p.value === null ? null : Number(p.value.toFixed(2)),
  ]);
}

export function RainfallChart({
  observed,
  baseline,
  forecast,
  height = 300,
}: RainfallChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<import("echarts").ECharts | null>(null);

  const option = useMemo(() => {
    const observedData = seriesData(observed);
    const baselineData = seriesData(baseline);
    const forecastData = seriesData(forecast);

    const series: Record<string, unknown>[] = [];
    if (baselineData.length) {
      series.push({
        name: "Baseline",
        type: "line",
        data: baselineData,
        smooth: false,
        showSymbol: false,
        connectNulls: true,
        lineStyle: { color: COLOR.baseline, width: 1.5, type: "dashed" },
        itemStyle: { color: COLOR.baseline },
        emphasis: { focus: "series" },
      });
    }
    if (observedData.length) {
      series.push({
        name: "Observed (reanalysis)",
        type: "bar",
        data: observedData,
        barMaxWidth: 12,
        itemStyle: { color: COLOR.observed, borderRadius: [2, 2, 0, 0] },
        emphasis: { focus: "series" },
      });
    }
    if (forecastData.length) {
      series.push({
        name: "Forecast (modelled)",
        type: "bar",
        data: forecastData,
        barMaxWidth: 12,
        itemStyle: { color: COLOR.forecast, borderRadius: [2, 2, 0, 0] },
        emphasis: { focus: "series" },
      });
    }

    const allDates = Array.from(
      new Set([
        ...observedData.map((d) => d[0]),
        ...baselineData.map((d) => d[0]),
        ...forecastData.map((d) => d[0]),
      ]),
    ).sort();

    return {
      backgroundColor: "transparent",
      animationDuration: 300,
      grid: { left: 46, right: 14, top: 30, bottom: 40 },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#08192e",
        borderColor: "rgba(255,255,255,0.1)",
        textStyle: { color: "#e3eaf1", fontSize: 12 },
        valueFormatter: (v: unknown) => (v === null || v === undefined ? "no data" : `${v} mm`),
      },
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: COLOR.axis, fontSize: 11 },
        icon: "roundRect",
        itemWidth: 10,
        itemHeight: 10,
        data: series.map((s) => s.name as string),
      },
      xAxis: {
        type: "category",
        data: allDates,
        axisLine: { lineStyle: { color: COLOR.grid } },
        axisLabel: { color: COLOR.axis, fontSize: 10 },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        name: "mm",
        nameTextStyle: { color: COLOR.axis, fontSize: 10 },
        splitLine: { lineStyle: { color: COLOR.grid } },
        axisLabel: { color: COLOR.axis, fontSize: 10 },
      },
      series,
    };
  }, [observed, baseline, forecast]);

  useEffect(() => {
    let disposed = false;
    if (!containerRef.current) return;

    void import("echarts").then((echarts) => {
      if (disposed || !containerRef.current) return;
      if (!chartRef.current) {
        chartRef.current = echarts.init(containerRef.current, undefined, {
          renderer: "canvas",
        });
      }
      chartRef.current.setOption(option, true);
    });

    const onResize = () => chartRef.current?.resize();
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
      style={{ height }}
      role="img"
      aria-label="Precipitation time series comparing observed, baseline and forecast rainfall"
    />
  );
}
