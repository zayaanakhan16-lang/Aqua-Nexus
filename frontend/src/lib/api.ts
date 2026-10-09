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
  placeSearchResponseSchema,
  precipitationComparisonSchema,
  precipitationSeriesSchema,
  providerCatalogSchema,
  stacSearchResultSchema,
  type Health,
  type LocationSummary,
  type PlaceSearchResponse,
  type PrecipitationComparison,
  type PrecipitationSeries,
  type ProviderCatalog,
  type StacSearchResult,
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

  /** True when the backend reached a provider but it returned nothing usable. */
  get isUnavailable(): boolean {
    return ["provider_unavailable", "provider_timeout", "insufficient_data"].includes(
      this.code,
    );
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

function qs(params: Record<string, string | number | undefined | null>): string {
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
};
