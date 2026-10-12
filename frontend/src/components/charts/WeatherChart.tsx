"use client";

/**
 * Weather forecast chart.
 *
 * Renders the real daily forecast from Open-Meteo: a temperature range band and
 * a precipitation bar series on a second axis, with a legend and tooltips that
 * report actual values. Missing days stay visibly missing. Everything shown is
 * labelled modelled forecast output, never an observation.
 */
import { useEffect, useMemo, useRef } from "react";

import { weatherCodeLabel } from "@/lib/weather";
import type { WeatherForecast } from "@/lib/schemas";

const COLOR = {
  tempMax: "#e4795b",
  tempMin: "#63d8f3",
  precip: "#2cc0e4",
  grid: "rgba(255,255,255,0.06)",
  axis: "#8ea0b6",
};

export function WeatherChart({
  forecast,
  height = 300,
}: {
  forecast: WeatherForecast;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<import("echarts").ECharts | null>(null);

  const option = useMemo(() => {
    const days = forecast.daily.map((d) => d.date);
    const tmax = forecast.daily.map((d) => d.temperature_max_c ?? null);
    const tmin = forecast.daily.map((d) => d.temperature_min_c ?? null);
    const precip = forecast.daily.map((d) => d.precipitation_sum_mm ?? null);
    const codeLabels = forecast.daily.map((d) => weatherCodeLabel(d.weather_code));

    return {
      backgroundColor: "transparent",
      animationDuration: 300,
      grid: { left: 48, right: 52, top: 34, bottom: 36 },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#08192e",
        borderColor: "rgba(255,255,255,0.1)",
        textStyle: { color: "#e3eaf1", fontSize: 12 },
        formatter: (params: unknown) => {
          const items = params as { dataIndex: number }[];
          if (!items.length) return "";
          const i = items[0]!.dataIndex;
          const lines = [
            `<strong>${days[i]}</strong>`,
            tmax[i] !== null ? `Max ${tmax[i]} °C` : "Max: no data",
            tmin[i] !== null ? `Min ${tmin[i]} °C` : "Min: no data",
            precip[i] !== null ? `Precip ${precip[i]} mm` : "Precip: no data",
          ];
          if (codeLabels[i]) lines.push(codeLabels[i]!);
          return lines.join("<br/>");
        },
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
      yAxis: [
        {
          type: "value",
          name: "°C",
          nameTextStyle: { color: COLOR.axis, fontSize: 10 },
          splitLine: { lineStyle: { color: COLOR.grid } },
          axisLabel: { color: COLOR.axis, fontSize: 10 },
        },
        {
          type: "value",
          name: "mm",
          nameTextStyle: { color: COLOR.axis, fontSize: 10 },
          splitLine: { show: false },
          axisLabel: { color: COLOR.axis, fontSize: 10 },
        },
      ],
      series: [
        {
          name: "Precipitation",
          type: "bar",
          yAxisIndex: 1,
          data: precip,
          barMaxWidth: 14,
          itemStyle: { color: COLOR.precip, borderRadius: [2, 2, 0, 0] },
        },
        {
          name: "Max temperature",
          type: "line",
          data: tmax,
          smooth: false,
          symbolSize: 6,
          connectNulls: false,
          lineStyle: { color: COLOR.tempMax, width: 2 },
          itemStyle: { color: COLOR.tempMax },
        },
        {
          name: "Min temperature",
          type: "line",
          data: tmin,
          smooth: false,
          symbolSize: 6,
          connectNulls: false,
          lineStyle: { color: COLOR.tempMin, width: 2 },
          itemStyle: { color: COLOR.tempMin },
        },
      ],
    };
  }, [forecast]);

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
      aria-label="Daily forecast of maximum and minimum temperature and precipitation"
    />
  );
}
