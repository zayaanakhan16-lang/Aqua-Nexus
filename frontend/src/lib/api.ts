/**
 * Typed API client for the AquaNexus backend.
 *
 * All calls validate the response against a Zod schema. Errors are normalized
 * into ApiError so UI code can render honest unavailable states. No credential
 * ever reaches this layer: the browser only talks to the AquaNexus backend.
 */
import type { z } from "zod";

import {
  apiErrorSchema,
  healthSchema,
  locationSummarySchema,
  mapLayerCatalogSchema,
  placeSearchResponseSchema,
  precipitationComparisonSchema,
  precipitationSeriesSchema,
  providerCatalogSchema,
  reportPayloadSchema,
  stacSearchResultSchema,
  hlsSearchResultSchema,
  studyAreaListResponseSchema,
  studyAreaSchema,
  dischargeSeriesSchema,
  waterBodyResultSchema,
  areaSelectionSchema,
  weatherForecastSchema,
  aiAnalysisReportSchema,
  type AIAnalysisReport,
  type AreaSelection,
  type DischargeSeries,
  type Health,
  type HLSSearchResult,
  type LocationSummary,
  type MapLayerCatalog,
  type PlaceSearchResponse,
  type PrecipitationComparison,
  type PrecipitationSeries,
  type ProviderCatalog,
  type ReportPayload,
  type StacSearchResult,
  type StudyArea,
  type StudyAreaListResponse,
  type WaterBodyResult,
  type WeatherForecast,
} from "./schemas";

// Calls are proxied by Next.js to the FastAPI backend (see next.config.mjs),
// so the browser talks to the same origin by default. Override with
// NEXT_PUBLIC_API_BASE_URL only when the API lives on a different origin.
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(
    message: string,
    opts: { code?: string; status?: number; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.code = opts.code ?? "client_error";
    this.status = opts.status ?? 0;
    this.details = opts.details ?? {};
  }

  /** True when a provider returned nothing usable, or the API itself is down. */
  get isUnavailable(): boolean {
    return [
      "provider_unavailable",
      "provider_timeout",
      "insufficient_data",
      // Emitted by the same-origin proxy when the backend cannot be reached or
      // does not answer in time. These are honest "unavailable" states, not
      // application crashes.
      "backend_unreachable",
      "backend_timeout",
      "network_error",
      "timeout",
    ].includes(this.code);
  }
}

async function request<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  init?: RequestInit & { timeoutMs?: number },
): Promise<z.infer<T>> {
  const { timeoutMs = 45000, ...rest } = init ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // A caller-supplied signal (e.g. a superseded search) must be able to cancel
  // this request too, so forward its abort to our controller instead of letting
  // `signal` below overwrite it.
  const callerSignal = rest.signal ?? null;
  const forwardAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", forwardAbort, { once: true });
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: { Accept: "application/json", ...(rest.headers ?? {}) },
      cache: "no-store",
    });
  } catch (error) {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", forwardAbort);
    if (error instanceof DOMException && error.name === "AbortError") {
      // Distinguish an explicit caller cancellation from our own timeout.
      if (callerSignal?.aborted) {
        throw new ApiError("The request was cancelled.", { code: "aborted" });
      }
      throw new ApiError("The request timed out.", { code: "timeout" });
    }
    throw new ApiError("Could not reach the AquaNexus API.", { code: "network_error" });
  }
  clearTimeout(timer);
  callerSignal?.removeEventListener("abort", forwardAbort);

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError("The API returned a non-JSON response.", {
        code: "invalid_response",
        status: response.status,
      });
    }
  }

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(payload);
    if (parsedError.success) {
      throw new ApiError(parsedError.data.error.message, {
        code: parsedError.data.error.code,
        status: response.status,
        details: parsedError.data.error.details,
      });
    }
    throw new ApiError(`Request failed with status ${response.status}.`, {
      code: "http_error",
      status: response.status,
    });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError("The API response did not match the expected contract.", {
      code: "contract_error",
      status: response.status,
    });
  }
  return parsed.data;
}

/** Perform a request that is expected to return no body (e.g. HTTP 204). */
async function requestNoContent(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<void> {
  const { timeoutMs = 45000, ...rest } = init ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: { Accept: "application/json", ...(rest.headers ?? {}) },
      cache: "no-store",
    });
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("The request timed out.", { code: "timeout" });
    }
    throw new ApiError("Could not reach the AquaNexus API.", { code: "network_error" });
  }
  clearTimeout(timer);

  if (!response.ok) {
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }
    const parsedError = apiErrorSchema.safeParse(payload);
    if (parsedError.success) {
      throw new ApiError(parsedError.data.error.message, {
        code: parsedError.data.error.code,
        status: response.status,
        details: parsedError.data.error.details,
      });
    }
    throw new ApiError(`Request failed with status ${response.status}.`, {
      code: "http_error",
      status: response.status,
    });
  }
}

function qs(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export const api = {
  baseUrl: API_BASE,

  health(): Promise<Health> {
    return request("/api/v1/health", healthSchema);
  },

  providers(): Promise<ProviderCatalog> {
    return request("/api/v1/providers", providerCatalogSchema);
  },

  geocode(query: string, limit = 8, signal?: AbortSignal): Promise<PlaceSearchResponse> {
    return request(`/api/v1/geocode${qs({ q: query, limit })}`, placeSearchResponseSchema, {
      signal,
    });
  },

  forecast(lat: number, lon: number, days = 7): Promise<PrecipitationSeries> {
    return request(
      `/api/v1/precipitation/forecast${qs({ latitude: lat, longitude: lon, days })}`,
      precipitationSeriesSchema,
    );
  },

  historical(lat: number, lon: number, days = 30): Promise<PrecipitationSeries> {
    return request(
      `/api/v1/precipitation/historical${qs({ latitude: lat, longitude: lon, days })}`,
      precipitationSeriesSchema,
    );
  },

  comparison(
    lat: number,
    lon: number,
    days = 30,
    baselineYears = 1,
  ): Promise<PrecipitationComparison> {
    return request(
      `/api/v1/precipitation/comparison${qs({
        latitude: lat,
        longitude: lon,
        days,
        baseline_years: baselineYears,
      })}`,
      precipitationComparisonSchema,
    );
  },

  summary(
    lat: number,
    lon: number,
    opts: { label?: string; windowDays?: number } = {},
  ): Promise<LocationSummary> {
    return request(
      `/api/v1/location/summary${qs({
        latitude: lat,
        longitude: lon,
        label: opts.label,
        window_days: opts.windowDays ?? 30,
      })}`,
      locationSummarySchema,
    );
  },

  scenes(
    lat: number,
    lon: number,
    opts: { days?: number; collection?: string; limit?: number } = {},
  ): Promise<StacSearchResult> {
    return request(
      `/api/v1/satellite/scenes${qs({
        latitude: lat,
        longitude: lon,
        days: opts.days ?? 30,
        collection: opts.collection ?? "sentinel-2-l2a",
        limit: opts.limit ?? 12,
      })}`,
      stacSearchResultSchema,
    );
  },

  hlsScenes(
    lat: number,
    lon: number,
    opts: { days?: number; collection?: string; limit?: number } = {},
  ): Promise<HLSSearchResult> {
    return request(
      `/api/v1/satellite/hls${qs({
        latitude: lat,
        longitude: lon,
        days: opts.days ?? 30,
        collection: opts.collection ?? "HLSS30_2.0",
        limit: opts.limit ?? 8,
      })}`,
      hlsSearchResultSchema,
    );
  },

  weather(lat: number, lon: number, days = 7): Promise<WeatherForecast> {
    return request(
      `/api/v1/weather${qs({ latitude: lat, longitude: lon, days })}`,
      weatherForecastSchema,
    );
  },

  waterBodies(
    lat: number,
    lon: number,
    opts: { radiusM?: number; limit?: number } = {},
  ): Promise<WaterBodyResult> {
    return request(
      `/api/v1/water/bodies${qs({
        latitude: lat,
        longitude: lon,
        radius_m: opts.radiusM ?? 15000,
        limit: opts.limit ?? 25,
      })}`,
      waterBodyResultSchema,
      { timeoutMs: 30000 },
    );
  },

  selectArea(input: {
    coordinates?: number[][] | null;
    latitude?: number;
    longitude?: number;
    label?: string;
  }): Promise<AreaSelection> {
    return request("/api/v1/water/area", areaSelectionSchema, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  },

  discharge(lat: number, lon: number, days = 14): Promise<DischargeSeries> {
    return request(
      `/api/v1/discharge${qs({ latitude: lat, longitude: lon, days })}`,
      dischargeSeriesSchema,
    );
  },

  aiAnalysis(
    lat: number,
    lon: number,
    opts: { label?: string; windowDays?: number } = {},
  ): Promise<AIAnalysisReport> {
    return request(
      `/api/v1/ai/analysis${qs({
        latitude: lat,
        longitude: lon,
        label: opts.label,
        window_days: opts.windowDays ?? 30,
      })}`,
      aiAnalysisReportSchema,
      { timeoutMs: 60000 },
    );
  },

  listStudyAreas(): Promise<StudyAreaListResponse> {
    return request("/api/v1/study-areas", studyAreaListResponseSchema);
  },

  getStudyArea(id: string): Promise<StudyArea> {
    return request(`/api/v1/study-areas/${encodeURIComponent(id)}`, studyAreaSchema);
  },

  createStudyArea(input: {
    name: string;
    latitude: number;
    longitude: number;
    label?: string | null;
    place?: unknown;
  }): Promise<StudyArea> {
    return request("/api/v1/study-areas", studyAreaSchema, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  },

  renameStudyArea(id: string, name: string): Promise<StudyArea> {
    return request(`/api/v1/study-areas/${encodeURIComponent(id)}`, studyAreaSchema, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  },

  deleteStudyArea(id: string): Promise<void> {
    return requestNoContent(`/api/v1/study-areas/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  mapLayers(verify = true): Promise<MapLayerCatalog> {
    return request(`/api/v1/map/layers${qs({ verify })}`, mapLayerCatalogSchema);
  },

  reportPreview(
    lat: number,
    lon: number,
    opts: { name?: string; windowDays?: number; includeAi?: boolean } = {},
  ): Promise<ReportPayload> {
    return request(
      `/api/v1/reports/preview${qs({
        latitude: lat,
        longitude: lon,
        name: opts.name,
        window_days: opts.windowDays ?? 30,
        include_ai: opts.includeAi ?? true,
      })}`,
      reportPayloadSchema,
      { timeoutMs: 90000 },
    );
  },

  /**
   * Generate and download the branded PDF report.
   *
   * Returns the raw blob plus the server-assigned report id (from the
   * `X-Report-Id` header) so the UI can show which report was produced. Errors
   * are normalized to ApiError like every other call.
   */
  async generateReport(input: {
    latitude: number;
    longitude: number;
    name?: string;
    label?: string;
    windowDays?: number;
    includeAi?: boolean;
  }): Promise<{ blob: Blob; reportId: string | null; completeness: string | null }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/api/v1/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/pdf" },
        body: JSON.stringify({
          latitude: input.latitude,
          longitude: input.longitude,
          name: input.name,
          label: input.label,
          window_days: input.windowDays ?? 30,
          include_ai: input.includeAi ?? true,
        }),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError("Report generation timed out.", { code: "timeout" });
      }
      throw new ApiError("Could not reach the AquaNexus API.", { code: "network_error" });
    }
    clearTimeout(timer);

    if (!response.ok) {
      const text = await response.text();
      let payload: unknown = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = null;
        }
      }
      const parsedError = apiErrorSchema.safeParse(payload);
      if (parsedError.success) {
        throw new ApiError(parsedError.data.error.message, {
          code: parsedError.data.error.code,
          status: response.status,
          details: parsedError.data.error.details,
        });
      }
      throw new ApiError(`Report generation failed with status ${response.status}.`, {
        code: "http_error",
        status: response.status,
      });
    }

    const blob = await response.blob();
    return {
      blob,
      reportId: response.headers.get("X-Report-Id"),
      completeness: response.headers.get("X-Report-Completeness"),
    };
  },
};
