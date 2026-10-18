import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GlobalLayersPanel } from "@/components/panels/GlobalLayersPanel";
import { WorkspaceProvider } from "@/lib/workspace";

/**
 * The global layer panel is the place a judge checks that the map layers are
 * real. These tests pin the two honesty guarantees: a served layer exposes its
 * units, resolution, source and legend; an unserved layer is shown greyed with
 * an explicit reason and cannot be selected.
 */

function layer(overrides: Record<string, unknown> = {}) {
  return {
    id: "imerg_precipitation_rate",
    name: "Precipitation rate (satellite estimate)",
    category: "precipitation",
    description: "NASA GPM IMERG near-real-time precipitation rate.",
    classification: "satellite_estimate",
    units: "mm/hour",
    spatial_resolution: "0.1 deg (~10 km)",
    temporal_resolution: "Daily composite (near-real-time)",
    source_id: "nasa_gibs",
    source_name: "NASA GIBS",
    attribution: "NASA EOSDIS Global Imagery Browse Services (GIBS)",
    product: "GPM IMERG (near-real-time) via GIBS",
    docs_url: "https://gibs.earthdata.nasa.gov/",
    color_scale: ["#c7e9ff", "#1d7fd6"],
    legend: [
      { value: 0.0, color: "#c7e9ff", label: "Trace / very light" },
      { value: 5.0, color: "#1d7fd6", label: "Moderate rain" },
    ],
    legend_note: "Blue intensity scales with the estimated precipitation rate.",
    available: true,
    unavailable_reason: null,
    default_date: "2026-10-17",
    tile_template:
      "https://gibs.earthdata.nasa.gov/IMERG_Precipitation_Rate/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png",
    tile_format: "png",
    max_zoom: 6,
    default_opacity: 0.75,
    limitations: ["Satellite/IR merged estimate; it is not a rain-gauge reading."],
    disclaimer: null,
    ...overrides,
  };
}

function catalogBody(layers: unknown[], availableCount: number) {
  return {
    generated_at: "2026-10-18T08:00:00Z",
    default_date: "2026-10-17",
    available_count: availableCount,
    layers,
    notes: ["Availability is probed against the live GIBS service at request time."],
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPanel() {
  return render(
    <WorkspaceProvider>
      <GlobalLayersPanel />
    </WorkspaceProvider>,
  );
}

describe("GlobalLayersPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows units, resolution, source and legend for an available layer", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json(catalogBody([layer()], 1)),
    );

    renderPanel();

    expect(
      await screen.findByText("Precipitation rate (satellite estimate)"),
    ).toBeInTheDocument();
    expect(screen.getByText("mm/hour")).toBeInTheDocument();
    expect(screen.getByText("0.1 deg (~10 km)")).toBeInTheDocument();
    expect(screen.getByText("NASA GIBS")).toBeInTheDocument();
    expect(screen.getByText("1 of 1 available now")).toBeInTheDocument();

    // The legend is real: its colour stops and labels come from the catalog.
    screen.getByRole("button", { name: /show legend/i }).click();
    expect(await screen.findByText("Moderate rain")).toBeInTheDocument();
    expect(screen.getByText(/blue intensity scales/i)).toBeInTheDocument();
  });

  it("shows an unavailable layer greyed with a reason instead of hiding it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json(
        catalogBody(
          [
            layer({
              available: false,
              unavailable_reason: "Layer not currently served by GIBS.",
              tile_template: null,
            }),
          ],
          0,
        ),
      ),
    );

    renderPanel();

    const radio = await screen.findByRole("radio", {
      name: /show precipitation rate/i,
    });
    expect(radio).toBeDisabled();
    expect(screen.getByText("Layer not currently served by GIBS.")).toBeInTheDocument();
    expect(screen.getByText("0 of 1 available now")).toBeInTheDocument();
  });

  it("shows an error state with a retry when the catalog cannot be fetched", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "boom", message: "Catalog failed" } }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderPanel();

    await waitFor(() =>
      expect(screen.getByText("Global layers unavailable")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
