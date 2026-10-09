import { describe, expect, it } from "vitest";

import { apiErrorSchema, locationSummarySchema, precipitationSeriesSchema } from "@/lib/schemas";

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

describe("apiErrorSchema", () => {
  it("matches the backend error envelope", () => {
    const parsed = apiErrorSchema.safeParse({
      error: { code: "provider_timeout", message: "timed out", details: {} },
    });
    expect(parsed.success).toBe(true);
  });
});
