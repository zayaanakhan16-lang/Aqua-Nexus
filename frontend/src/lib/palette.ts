/**
 * Canvas-drawn colours — the single source for ECharts and MapLibre paint.
 *
 * Both libraries draw to a canvas and cannot read Tailwind classes, so their
 * colours must exist as literals somewhere. Keeping them here, mirroring the
 * tokens in `tailwind.config.ts`, means a series or map layer can never drift
 * from the interface around it and there is no second palette to maintain.
 *
 * Change a hue in `tailwind.config.ts` and mirror it here.
 */

/** Raw token values, named after the Tailwind tokens they mirror. */
export const PALETTE = {
  abyss950: "#04101f",
  abyss900: "#071d35",
  abyss850: "#0a2542",
  abyss800: "#0d2c4d",
  water300: "#45b6e8",
  water200: "#b3daf0",
  teal400: "#38d0a6",
  teal600: "#0d8a6b",
  ink100: "#eaf5fa",
  ink300: "#a9c9e0",
  ink400: "#88a8c4",
  ink500: "#97b6ce",
  boundary: "#e3b341",
  viz1: "#45b6e8",
  viz2: "#f2b134",
  viz3: "#4fd1a5",
  viz4: "#f2708a",
  viz5: "#a78bfa",
  viz6: "#f2e14c",
  viz7: "#7fb6e0",
  viz8: "#e4795b",
  alert: "#ec7a5c",
} as const;

/** Series colours. Observed/forecast/baseline stay stable across every chart. */
export const CHART_COLORS = {
  /** Measured observation — the restrained water-cyan accent. */
  observed: PALETTE.water300,
  /** Reanalysis/hindcast series (discharge). */
  historical: PALETTE.teal400,
  /** Modelled forecast — teal, distinct from the observation cyan. */
  forecast: PALETTE.teal400,
  /** Comparison baseline — muted ink, deliberately recessive. */
  baseline: PALETTE.ink400,
  /** Daily maximum temperature. */
  tempMax: PALETTE.viz8,
  /** Daily minimum temperature — lighter cyan than the precipitation series. */
  tempMin: PALETTE.water200,
  /** Precipitation bars/line. */
  precip: PALETTE.water300,
} as const;

/** Non-series chrome: grid, axes, tooltips and legend text. */
export const CHART_CHROME = {
  grid: "rgba(255,255,255,0.06)",
  axis: PALETTE.ink400,
  gap: "rgba(136,168,196,0.10)",
  band: "rgba(69,182,232,0.16)",
  areaFill: "rgba(56,208,166,0.12)",
  tooltipBg: PALETTE.abyss900,
  tooltipBorder: "rgba(255,255,255,0.1)",
  tooltipText: PALETTE.ink100,
  axisFontSize: 10,
  legendFontSize: 11,
  tooltipFontSize: 12,
} as const;

/** Map paint colours for the OpenStreetMap water-feature overlay. */
export const MAP_COLORS = {
  /** Water-body fill: the accent at low opacity so imagery stays readable. */
  waterFill: PALETTE.water300,
  /** Water-body outline. */
  waterLine: PALETTE.water300,
  /** Satellite footprints: dashed muted ink, i.e. reference metadata. */
  sceneLine: PALETTE.ink300,
  /** The selected area: the accent, unmistakably "this is yours". */
  selection: PALETTE.water300,
  /** Drawn-area boundary: warm amber/gold, never confused with the accent. */
  boundary: PALETTE.boundary,
  /** Marker stroke: the workspace backdrop, so markers read as punched out. */
  markerStroke: PALETTE.abyss950,
  /** Popup body text. */
  popupText: PALETTE.abyss800,
} as const;

/** Shared tooltip chrome so every chart's hover card looks identical. */
export function chartTooltip() {
  return {
    backgroundColor: CHART_CHROME.tooltipBg,
    borderColor: CHART_CHROME.tooltipBorder,
    textStyle: { color: CHART_CHROME.tooltipText, fontSize: CHART_CHROME.tooltipFontSize },
  };
}
