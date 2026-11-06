import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

import { PALETTE } from "@/lib/palette";

/**
 * The AquaNexus "Ocean" basemap.
 *
 * AgriSense draws its map by tinting a keyless vector source with the product
 * palette rather than shipping a pre-baked dark theme, so the canvas belongs to
 * the same surface family as the chrome around it. This is the water-blue
 * equivalent: one deep-ocean backdrop, land and water distinguished by small
 * luminance steps, and a restrained cyan used only for coastlines and water
 * labels so the map reads as a bathymetric canvas instead of a grey street map.
 *
 * Only layers that carry meaning for water intelligence are drawn — water,
 * waterways, land cover, boundaries, roads for orientation, and place names.
 * Nothing here invents data: every feature comes from the OpenFreeMap vector
 * tiles and keeps its own attribution.
 */

/*
 * A bathymetric ramp derived from the token palette: the backdrop is the
 * workspace colour, land sits one step above it, and water is the one cool
 * surface that is lighter than land so coastlines read at a glance. These
 * values are the basemap's own layer hues (there is no Tailwind class for a
 * vector-tile fill), but every one of them is sampled from the same blue
 * family as the tokens rather than introducing a second palette.
 */
const TINT = {
  background: PALETTE.abyss950,
  water: "#0b3454",
  waterLine: "#1b5c86",
  waterLabel: PALETTE.water300,
  wood: "#082238",
  landcover: "#082031",
  landuse: PALETTE.abyss850,
  park: "#0b2b3c",
  building: PALETTE.abyss800,
  boundary: "#1c4a6d",
  roadMinor: "#1b4260",
  roadMajor: "#2a6d97",
  roadCasing: "#0a2136",
  text: "#cfe6f5",
  textHalo: PALETTE.abyss950,
} as const;

const SOURCE = "openmaptiles";

function fill(id: string, sourceLayer: string, color: string, opacity: number): LayerSpecification {
  return {
    id,
    type: "fill",
    source: SOURCE,
    "source-layer": sourceLayer,
    paint: { "fill-color": color, "fill-opacity": opacity },
  };
}

function line(
  id: string,
  sourceLayer: string,
  color: string,
  width: number,
  extra: Record<string, unknown> = {},
  filter?: unknown,
): LayerSpecification {
  return {
    id,
    type: "line",
    source: SOURCE,
    "source-layer": sourceLayer,
    ...(filter ? { filter } : {}),
    paint: { "line-color": color, "line-width": width, ...extra },
  } as LayerSpecification;
}

function placeLabel(
  id: string,
  sourceLayer: string,
  minzoom: number,
  sizeAtMin: number,
  sizeAtMax: number,
  color: string,
): LayerSpecification {
  return {
    id,
    type: "symbol",
    source: SOURCE,
    "source-layer": sourceLayer,
    minzoom,
    layout: {
      "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]],
      "text-font": ["Noto Sans Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 3, sizeAtMin, 12, sizeAtMax],
      "text-max-width": 9,
      "text-letter-spacing": 0.02,
    },
    paint: {
      "text-color": color,
      "text-halo-color": TINT.textHalo,
      "text-halo-width": 1.2,
    },
  } as unknown as LayerSpecification;
}

export const AQUA_OCEAN_STYLE: StyleSpecification = {
  version: 8,
  name: "AquaNexus Ocean",
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    [SOURCE]: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
      attribution: "© OpenFreeMap · © OpenStreetMap contributors",
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": TINT.background } },
    fill("landcover-wood", "landcover", TINT.wood, 0.85),
    fill("landuse-residential", "landuse", TINT.landuse, 0.6),
    fill("landuse-park", "landuse", TINT.park, 0.5),
    fill("landcover-other", "landcover", TINT.landcover, 0.45),
    fill("water", "water", TINT.water, 1),
    line("waterway", "waterway", TINT.waterLine, 1.1),
    fill("building", "building", TINT.building, 0.75),
    line(
      "road-casing",
      "transportation",
      TINT.roadCasing,
      3.6,
      { "line-opacity": 0.6 },
      ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary"]]],
    ),
    line(
      "road-major",
      "transportation",
      TINT.roadMajor,
      1.5,
      { "line-opacity": 0.85 },
      ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary"]]],
    ),
    line(
      "road-minor",
      "transportation",
      TINT.roadMinor,
      0.7,
      { "line-opacity": 0.6 },
      ["in", ["get", "class"], ["literal", ["secondary", "tertiary"]]],
    ),
    line("boundary-admin", "boundary", TINT.boundary, 0.7, {
      "line-dasharray": [3, 2],
      "line-opacity": 0.8,
    }),
    placeLabel("label-water", "water_name", 5, 9, 12, TINT.waterLabel),
    placeLabel("label-place", "place", 3, 9.5, 13, TINT.text),
  ],
  sky: {
    "sky-color": TINT.background,
    "horizon-color": "#0a2a44",
    "fog-color": "#0a2a44",
    "sky-horizon-blend": 0.5,
    "horizon-fog-blend": 0.6,
    "fog-ground-blend": 0.85,
  },
} as unknown as StyleSpecification;
