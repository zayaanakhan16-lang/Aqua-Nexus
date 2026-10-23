import { describe, expect, it } from "vitest";

import { apiErrorSchema, hlsSearchResultSchema, locationSummarySchema, precipitationSeriesSchema } from "@/lib/schemas";

describe("locationSummarySchema", () => {
  it("accepts a valid summary payload", () => {
    const parsed = locationSummarySchema.safeParse({
      location: { latitude: 52.52, longitude: 13.4 },
      label: "Berlin",
      generated_at: "2026-01-01T00:00:00Z",
      providers: [
        {
          provider_id: "open_meteo_archive",
          provider_name: "Open-Meteo ERA5",
          status: "ok",
          classification: "reanalysis",
        },
      ],
      indicators: [
        {
          key: "coverage",
          label: "Coverage",
          value: 96.7,
          unit: "%",
          status: "ok",
          method: "present/total",
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown provider status", () => {
    const parsed = locationSummarySchema.safeParse({
      location: { latitude: 0, longitude: 0 },
      generated_at: "2026-01-01T00:00:00Z",
      providers: [
        { provider_id: "x", provider_name: "X", status: "definitely_broken" },
      ],
      indicators: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown data classification", () => {
    const parsed = precipitationSeriesSchema.safeParse({
      location: { latitude: 0, longitude: 0 },
      start_date: "2026-01-01",
      end_date: "2026-01-02",
      granularity: "daily",
      unit: "mm",
      points: [],
      provenance: {
        source_id: "s",
        source_name: "S",
        classification: "guessed",
        retrieved_at: "2026-01-01T00:00:00Z",
      },
      provider: { id: "s", name: "S", classification: "reanalysis" },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("hlsSearchResultSchema", () => {
  const valid = {
    bbox: { west: 36.6, south: -1.4, east: 37.0, north: -1.1 },
    start: "2026-06-25T00:00:00Z",
    end: "2026-10-22T00:00:00Z",
    collection: "HLSS30_2.0",
    data_source: "Sentinel-2 (MSI)",
    count: 1,
    items: [
      {
        id: "HLS.S30.T37MBU.2026184T074031.v2.0",
        collection: "HLSS30_2.0",
        data_source: "Sentinel-2 (MSI)",
        acquired_at: "2026-07-03T08:00:41.236Z",
        cloud_cover: 4,
        bbox: [36.3, -1.9, 37.29, -0.9],
        record_url: "https://cmr.earthdata.nasa.gov/stac/LPCLOUD/collections/HLSS30_2.0/items/x",
      },
    ],
    provider: { provider_id: "nasa_hls_lpcloud", provider_name: "NASA HLS", status: "ok" },
    note: "Harmonized 30 m grid.",
  };

  it("accepts a valid HLS search payload", () => {
    expect(hlsSearchResultSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an unknown provider status", () => {
    const parsed = hlsSearchResultSchema.safeParse({
      ...valid,
      provider: { provider_id: "x", provider_name: "X", status: "broken" },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("apiErrorSchema", () => {
  it("matches the backend error envelope", () => {
    const parsed = apiErrorSchema.safeParse({
      error: { code: "provider_timeout", message: "timed out", details: {} },
    });
    expect(parsed.success).toBe(true);
  });
});
