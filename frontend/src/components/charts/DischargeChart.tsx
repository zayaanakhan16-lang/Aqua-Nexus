"use client";

/**
 * River discharge chart.
 *
 * Renders the modelled GloFAS daily discharge series alongside the same-day
 * forecast ensemble mean. Both series are modelled (classification:
 * simulation) and are labelled as such; the chart never presents them as gauge
 * measurements. Missing days remain gaps.
 */
import { useEffect, useMemo, useRef } from "react";

import type { DischargeSeries } from "@/lib/schemas";

const COLOR = {
  discharge: "#39d3b4",
  mean: "#8fa3b8",
  grid: "rgba(255,255,255,0.06)",
  axis: "#8ea0b6",
};

export function DischargeChart({
  series,
  height = 280,
}: {
  series: DischargeSeries;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<import("echarts").ECharts | null>(null);

  const option = useMemo(() => {
    const days = series.points.map((p) => p.timestamp.slice(0, 10));
    const discharge = series.points.map((p) => p.discharge_m3s ?? null);
    const mean = series.points.map((p) => p.ensemble_mean_m3s ?? null);

    return {
      backgroundColor: "transparent",
      animationDuration: 300,
      grid: { left: 56, right: 16, top: 30, bottom: 36 },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#08192e",
        borderColor: "rgba(255,255,255,0.1)",
        textStyle: { color: "#e3eaf1", fontSize: 12 },
        valueFormatter: (v: unknown) =>
          v === null || v === undefined ? "no data" : `${v} m³/s`,
      },
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: COLOR.axis, fontSize: 11 },
        icon: "roundRect",
        itemWidth: 10,
        itemHeight: 10,
      },
      xAxis: {
        type: "category",
        data: days,
        axisLine: { lineStyle: { color: COLOR.grid } },
        axisLabel: { color: COLOR.axis, fontSize: 10 },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        name: "m³/s",
        nameTextStyle: { color: COLOR.axis, fontSize: 10 },
        splitLine: { lineStyle: { color: COLOR.grid } },
        axisLabel: { color: COLOR.axis, fontSize: 10 },
      },
      series: [
        {
          name: "Modelled discharge",
          type: "line",
          data: discharge,
          smooth: false,
          symbolSize: 5,
          connectNulls: false,
          lineStyle: { color: COLOR.discharge, width: 2 },
          itemStyle: { color: COLOR.discharge },
          areaStyle: { color: "rgba(57,211,180,0.12)" },
        },
        {
          name: "Ensemble mean (modelled)",
          type: "line",
          data: mean,
          smooth: false,
          showSymbol: false,
          connectNulls: false,
          lineStyle: { color: COLOR.mean, width: 1.4, type: "dashed" },
          itemStyle: { color: COLOR.mean },
        },
      ],
    };
  }, [series]);

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
      aria-label="Modelled daily river discharge and same-day ensemble mean"
    />
  );
}
