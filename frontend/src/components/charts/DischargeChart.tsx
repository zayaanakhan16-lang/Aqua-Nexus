"use client";

/**
 * River discharge chart.
 *
 * Renders the modelled GloFAS daily discharge series, split explicitly into the
 * reanalysis/hindcast portion (before today) and the forecast portion, so a
 * forecast is never read as an observation. The forecast uncertainty band is the
 * ensemble p25-p75 spread. Every series is modelled (classification:
 * simulation) and is labelled as such; the chart never presents it as a gauge
 * measurement. Missing days remain gaps.
 */
import { useEffect, useMemo, useRef } from "react";

import type { DischargeSeries } from "@/lib/schemas";

const COLOR = {
  historical: "#39d3b4",
  forecast: "#45b6e8",
  mean: "#8fa3b8",
  band: "rgba(69,182,232,0.16)",
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
    // Split at the forecast boundary: historical points are null in the forecast
    // series and vice versa, so the two lines never overlap or imply continuity.
    const historical = series.points.map((p) =>
      p.is_forecast ? null : (p.discharge_m3s ?? null),
    );
    const forecast = series.points.map((p) =>
      p.is_forecast ? (p.discharge_m3s ?? null) : null,
    );
    const mean = series.points.map((p) =>
      p.is_forecast ? (p.ensemble_mean_m3s ?? null) : null,
    );
    // ECharts band trick: a lower bound series plus the difference as a stacked
    // area, giving a p25-p75 envelope without a custom renderer.
    const bandLow = series.points.map((p) =>
      p.is_forecast ? (p.ensemble_p25_m3s ?? null) : null,
    );
    const bandDiff = series.points.map((p) =>
      p.is_forecast && p.ensemble_p25_m3s != null && p.ensemble_p75_m3s != null
        ? Number((p.ensemble_p75_m3s - p.ensemble_p25_m3s).toFixed(3))
        : null,
    );

    const hasBand = bandLow.some((v) => v !== null);

    return {
      backgroundColor: "transparent",
      animationDuration: 300,
      grid: { left: 56, right: 16, top: 34, bottom: 36 },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#08192e",
        borderColor: "rgba(255,255,255,0.1)",
        textStyle: { color: "#e3eaf1", fontSize: 12 },
        valueFormatter: (v: unknown) =>
          v === null || v === undefined ? "no data" : `${v} m\u00b3/s`,
      },
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: COLOR.axis, fontSize: 11 },
        icon: "roundRect",
        itemWidth: 10,
        itemHeight: 10,
        data: [
          "Reanalysis / hindcast",
          "Forecast",
          "Ensemble mean (forecast)",
          ...(hasBand ? ["Ensemble p25-p75"] : []),
        ],
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
        name: "m\u00b3/s",
        nameTextStyle: { color: COLOR.axis, fontSize: 10 },
        splitLine: { lineStyle: { color: COLOR.grid } },
        axisLabel: { color: COLOR.axis, fontSize: 10 },
      },
      series: [
        {
          name: "Reanalysis / hindcast",
          type: "line",
          data: historical,
          smooth: false,
          symbolSize: 5,
          connectNulls: false,
          lineStyle: { color: COLOR.historical, width: 2 },
          itemStyle: { color: COLOR.historical },
          areaStyle: { color: "rgba(57,211,180,0.12)" },
        },
        {
          name: "Forecast",
          type: "line",
          data: forecast,
          smooth: false,
          symbolSize: 5,
          connectNulls: false,
          lineStyle: { color: COLOR.forecast, width: 2 },
          itemStyle: { color: COLOR.forecast },
        },
        {
          name: "Ensemble mean (forecast)",
          type: "line",
          data: mean,
          smooth: false,
          showSymbol: false,
          connectNulls: false,
          lineStyle: { color: COLOR.mean, width: 1.4, type: "dashed" },
          itemStyle: { color: COLOR.mean },
        },
        ...(hasBand
          ? [
              {
                name: "Ensemble p25-p75",
                type: "line",
                data: bandLow,
                stack: "band",
                symbol: "none",
                lineStyle: { opacity: 0 },
                areaStyle: { opacity: 0 },
                silent: true,
                tooltip: { show: false },
              },
              {
                name: "Ensemble p25-p75",
                type: "line",
                data: bandDiff,
                stack: "band",
                symbol: "none",
                lineStyle: { opacity: 0 },
                areaStyle: { color: COLOR.band },
                silent: true,
                tooltip: { show: false },
              },
            ]
          : []),
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
      aria-label="Modelled daily river discharge, split into reanalysis/hindcast and forecast, with the forecast ensemble mean and p25-p75 spread"
    />
  );
}
