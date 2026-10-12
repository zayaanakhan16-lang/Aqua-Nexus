/**
 * Zod schemas mirroring the backend response models.
 *
 * External responses are validated at the boundary: if a payload ever drifts
 * from the contract we surface a typed error rather than rendering bad data.
 */
import { z } from "zod";

export const dataClassificationSchema = z.enum([
  "observation",
  "satellite_estimate",
  "reanalysis",
  "forecast",
  "derived",
  "simulation",
  "demonstration",
]);

export const providerStatusSchema = z.enum([
  "ok",
  "partial",
  "unconfigured",
  "unavailable",
  "error",
]);

export const providerReportSchema = z.object({
  provider_id: z.string(),
  provider_name: z.string(),
  status: providerStatusSchema,
  message: z.string().nullable().optional(),
  classification: dataClassificationSchema.nullable().optional(),
});

export const providerMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  product: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  attribution: z.string().nullable().optional(),
  license: z.string().nullable().optional(),
  classification: dataClassificationSchema,
  spatial_resolution: z.string().nullable().optional(),
  temporal_resolution: z.string().nullable().optional(),
  units: z.string().nullable().optional(),
  latency_note: z.string().nullable().optional(),
  coverage_note: z.string().nullable().optional(),
  limitations: z.array(z.string()).default([]),
});

export const provenanceSchema = z.object({
  source_id: z.string(),
  source_name: z.string(),
  classification: dataClassificationSchema,
  retrieved_at: z.string(),
  observed_at: z.string().nullable().optional(),
  method: z.string().nullable().optional(),
  method_version: z.string().nullable().optional(),
  is_fresh: z.boolean().default(true),
  notes: z.array(z.string()).default([]),
});

export const timeSeriesPointSchema = z.object({
  timestamp: z.string(),
  value: z.number().nullable(),
  unit: z.string(),
});

export const geoPointSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

export const placeResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  display_name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  country: z.string().nullable().optional(),
  country_code: z.string().nullable().optional(),
  admin1: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  feature_class: z.string().nullable().optional(),
  feature_type: z.string().nullable().optional(),
  population: z.number().nullable().optional(),
  source_id: z.string(),
});

export const placeSearchResponseSchema = z.object({
  query: z.string().nullable().optional(),
  count: z.number(),
  results: z.array(placeResultSchema),
  provider: providerReportSchema,
  attribution: z.string().nullable().optional(),
});

export const precipitationSeriesSchema = z.object({
  location: geoPointSchema,
  start_date: z.string(),
  end_date: z.string(),
  granularity: z.string(),
  unit: z.string(),
  points: z.array(timeSeriesPointSchema),
  provenance: provenanceSchema,
  provider: providerMetadataSchema,
  coverage: z.string().nullable().optional(),
  missing_days: z.number().default(0),
  total: z.number().nullable().optional(),
});

export const precipitationComparisonSchema = z.object({
  location: geoPointSchema,
  observed: precipitationSeriesSchema,
  baseline: precipitationSeriesSchema,
  baseline_years: z.array(z.number()),
  anomaly_mm: z.number(),
  anomaly_percent: z.number().nullable(),
  classification: z.record(z.string()),
  supported: z.boolean(),
  notes: z.array(z.string()).default([]),
});

export const indicatorSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.number().nullable(),
  unit: z.string(),
  status: z.string(),
  baseline: z.number().nullable().optional(),
  method: z.string(),
  method_version: z.string().default("1.0"),
  inputs: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  classification: dataClassificationSchema.default("derived"),
});

export const locationSummarySchema = z.object({
  location: geoPointSchema,
  label: z.string().nullable().optional(),
  resolved_place: placeResultSchema.nullable().optional(),
  generated_at: z.string(),
  providers: z.array(providerReportSchema),
  indicators: z.array(indicatorSchema),
  notes: z.array(z.string()).default([]),
});

export const healthSchema = z.object({
  status: z.string(),
  service: z.string(),
  version: z.string(),
  environment: z.string(),
  time_utc: z.string(),
});

export const providerCatalogSchema = z.object({
  count: z.number(),
  providers: z.array(providerMetadataSchema),
  classifications: z.array(z.string()),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).default({}),
  }),
});

export const stacItemSchema = z.object({
  id: z.string(),
  collection: z.string(),
  acquired_at: z.string().nullable().optional(),
  cloud_cover: z.number().nullable().optional(),
  platform: z.string().nullable().optional(),
  thumbnail: z.string().nullable().optional(),
  bbox: z.array(z.number()).nullable().optional(),
});

export const stacSearchResultSchema = z.object({
  bbox: z.object({
    west: z.number(),
    south: z.number(),
    east: z.number(),
    north: z.number(),
  }),
  start: z.string(),
  end: z.string(),
  collection: z.string(),
  count: z.number(),
  items: z.array(stacItemSchema),
  provider: providerReportSchema,
  note: z.string(),
});

export const weatherCurrentSchema = z.object({
  timestamp: z.string(),
  temperature_c: z.number().nullable().optional(),
  apparent_temperature_c: z.number().nullable().optional(),
  relative_humidity_pct: z.number().nullable().optional(),
  precipitation_mm: z.number().nullable().optional(),
  wind_speed_kmh: z.number().nullable().optional(),
  weather_code: z.number().nullable().optional(),
});

export const weatherDaySchema = z.object({
  date: z.string(),
  temperature_max_c: z.number().nullable().optional(),
  temperature_min_c: z.number().nullable().optional(),
  precipitation_sum_mm: z.number().nullable().optional(),
  wind_speed_max_kmh: z.number().nullable().optional(),
  weather_code: z.number().nullable().optional(),
});

export const weatherForecastSchema = z.object({
  location: geoPointSchema,
  current: weatherCurrentSchema.nullable().optional(),
  daily: z.array(weatherDaySchema).default([]),
  provenance: provenanceSchema,
  provider: providerMetadataSchema,
  notes: z.array(z.string()).default([]),
});

export const dischargePointSchema = z.object({
  timestamp: z.string(),
  discharge_m3s: z.number().nullable().optional(),
  ensemble_mean_m3s: z.number().nullable().optional(),
  ensemble_median_m3s: z.number().nullable().optional(),
});

export const dischargeSeriesSchema = z.object({
  location: geoPointSchema,
  start_date: z.string(),
  end_date: z.string(),
  granularity: z.string(),
  unit: z.string(),
  points: z.array(dischargePointSchema),
  provenance: provenanceSchema,
  provider: providerMetadataSchema,
  valid_days: z.number().default(0),
  missing_days: z.number().default(0),
  note: z.string().default(""),
});

export const studyAreaSchema = z.object({
  id: z.string(),
  name: z.string(),
  location: geoPointSchema,
  label: z.string().nullable().optional(),
  place: placeResultSchema.nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const studyAreaListResponseSchema = z.object({
  count: z.number(),
  study_areas: z.array(studyAreaSchema),
});

export type DataClassification = z.infer<typeof dataClassificationSchema>;
export type ProviderStatus = z.infer<typeof providerStatusSchema>;
export type ProviderReport = z.infer<typeof providerReportSchema>;
export type ProviderMetadata = z.infer<typeof providerMetadataSchema>;
export type Provenance = z.infer<typeof provenanceSchema>;
export type TimeSeriesPoint = z.infer<typeof timeSeriesPointSchema>;
export type GeoPoint = z.infer<typeof geoPointSchema>;
export type PlaceResult = z.infer<typeof placeResultSchema>;
export type PlaceSearchResponse = z.infer<typeof placeSearchResponseSchema>;
export type PrecipitationSeries = z.infer<typeof precipitationSeriesSchema>;
export type PrecipitationComparison = z.infer<typeof precipitationComparisonSchema>;
export type Indicator = z.infer<typeof indicatorSchema>;
export type LocationSummary = z.infer<typeof locationSummarySchema>;
export type Health = z.infer<typeof healthSchema>;
export type ProviderCatalog = z.infer<typeof providerCatalogSchema>;
export type StacItem = z.infer<typeof stacItemSchema>;
export type StacSearchResult = z.infer<typeof stacSearchResultSchema>;
export type WeatherCurrent = z.infer<typeof weatherCurrentSchema>;
export type WeatherDay = z.infer<typeof weatherDaySchema>;
export type WeatherForecast = z.infer<typeof weatherForecastSchema>;
export type DischargePoint = z.infer<typeof dischargePointSchema>;
export type DischargeSeries = z.infer<typeof dischargeSeriesSchema>;
export type StudyArea = z.infer<typeof studyAreaSchema>;
export type StudyAreaListResponse = z.infer<typeof studyAreaListResponseSchema>;
