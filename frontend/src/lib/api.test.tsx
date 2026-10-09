import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, api } from "@/lib/api";
import { ClassificationBadge } from "@/components/ui/primitives";

describe("ClassificationBadge", () => {
  it("labels a forecast distinctly from an observation", () => {
    const { rerender } = render(<ClassificationBadge classification="forecast" />);
    expect(screen.getByText("Forecast")).toBeInTheDocument();

    rerender(<ClassificationBadge classification="observation" />);
    expect(screen.getByText("Direct observation")).toBeInTheDocument();
    expect(screen.queryByText("Forecast")).not.toBeInTheDocument();
  });

  it("supports a compact short label", () => {
    render(<ClassificationBadge classification="satellite_estimate" compact />);
    expect(screen.getByText("Satellite")).toBeInTheDocument();
  });
});

describe("api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses a valid payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          location: { latitude: 1, longitude: 2 },
          start_date: "2026-01-01",
          end_date: "2026-01-31",
          granularity: "daily",
          unit: "mm",
          points: [{ timestamp: "2026-01-01T00:00:00Z", value: 3.2, unit: "mm" }],
          provenance: {
            source_id: "open_meteo_archive",
            source_name: "ERA5",
            classification: "reanalysis",
            retrieved_at: "2026-01-31T12:00:00Z",
          },
          provider: { id: "open_meteo_archive", name: "ERA5", classification: "reanalysis" },
          missing_days: 0,
          total: 3.2,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const series = await api.historical(1, 2, 30);
    expect(series.unit).toBe("mm");
    expect(series.points).toHaveLength(1);
  });

  it("surfaces a structured backend error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "provider_unavailable", message: "Provider down", details: {} },
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(api.summary(1, 2)).rejects.toMatchObject({
      name: "ApiError",
      code: "provider_unavailable",
      status: 503,
    });
  });

  it("rejects a contract-violating payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ unexpected: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const error = await api.health().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("contract_error");
  });

  it("normalizes network failure into a typed error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("failed to fetch"));
    const error = await api.health().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("network_error");
  });

  it("marks unavailable provider errors distinctly", async () => {
    const err = new ApiError("down", { code: "provider_timeout" });
    await waitFor(() => expect(err.isUnavailable).toBe(true));
  });
});
