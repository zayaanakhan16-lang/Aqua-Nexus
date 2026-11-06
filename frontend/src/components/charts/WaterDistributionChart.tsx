"use client";

/**
 * Water resource distribution — a donut of the mapped water bodies found near
 * the selected region, grouped by OpenStreetMap feature kind.
 *
 * The chart counts real features the backend returned. It deliberately reports
 * *counts of mapped features*, not volumes or areas of water: an OSM feature
 * count says how much has been mapped by contributors, not how much water is
 * present. When the mapping service did not answer, or nothing was mapped, the
 * chart shows an empty state instead of an empty ring that could be misread as
 * "no water here".
 */
import { useEffect, useMemo, useRef } from "react";

import { CHART_CHROME, CHART_COLORS, PALETTE, chartTooltip } from "@/lib/palette";
import type { WaterBodyResult } from "@/lib/schemas";

/** Stable colour and label per OSM water-feature kind. */
const KIND_STYLE: Record<string, { label: string; color: string }> = {
  lake: { label: "Lake", color: PALETTE.viz1 },
  reservoir: { label: "Reservoir", color: PALETTE.viz2 },
  river: { label: "River", color: PALETTE.viz3 },
  riverbank: { label: "Riverbank", color: PALETTE.viz7 },
  wetland: { label: "Wetland", color: PALETTE.viz4 },
  water: { label: "Water body", color: PALETTE.viz5 },
};

const FALLBACK_COLOR = PALETTE.ink400;

function styleFor(kind: string) {
  return KIND_STYLE[kind] ?? { label: kind, color: FALLBACK_COLOR };
}

export interface DistributionSlice {
  kind: string;
  label: string;
  color: string;
  count: number;
}

/** Group the returned bodies by kind, largest first. */
export function distributionSlices(data: WaterBodyResult | null): DistributionSlice[] {
  if (!data) return [];
  const counts = new Map<string, number>();
  for (const body of data.bodies) {
    counts.set(body.kind, (counts.get(body.kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count, ...styleFor(kind) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function WaterDistributionChart({
  data,
  height = 260,
}: {
  data: WaterBodyResult | null;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<import("echarts").ECharts | null>(null);
  const slices = useMemo(() => distributionSlices(data), [data]);

  const option = useMemo(() => {
    return {
      backgroundColor: "transparent",
      animationDuration: 300,
      tooltip: {
        trigger: "item",
        ...chartTooltip(),
        valueFormatter: (v: unknown) =>
          v === null || v === undefined ? "no data" : `${v} mapped feature(s)`,
      },
      legend: {
        bottom: 0,
        left: "center",
        textStyle: { color: CHART_CHROME.axis, fontSize: CHART_CHROME.legendFontSize },
        icon: "roundRect",
        itemWidth: 10,
        itemHeight: 10,
      },
      series: [
        {
          type: "pie",
          radius: ["52%", "76%"],
          center: ["50%", "44%"],
          avoidLabelOverlap: true,
          label: { show: false },
          labelLine: { show: false },
          itemStyle: {
            borderColor: PALETTE.abyss950,
            borderWidth: 2,
          },
          emphasis: {
            itemStyle: { shadowBlur: 0, borderColor: CHART_COLORS.observed, borderWidth: 2 },
          },
          data: slices.map((s) => ({
            name: s.label,
            value: s.count,
            itemStyle: { color: s.color },
          })),
        },
      ],
    };
  }, [slices]);

  useEffect(() => {
    let disposed = false;
    void import("echarts").then((echarts) => {
      if (disposed || !containerRef.current) return;
      const chart = chartRef.current ?? echarts.init(containerRef.current, undefined, {
        renderer: "canvas",
      });
      chartRef.current = chart;
      chart.setOption(option, true);
    });
    return () => {
      disposed = true;
    };
  }, [option]);

  useEffect(() => {
    return () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={{ height }} className="w-full" aria-hidden />;
}
