import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReportPanel } from "@/components/panels/ReportPanel";
import { WorkspaceProvider, type SelectedLocation } from "@/lib/workspace";

/**
 * The report tab must preview the *actual* payload the PDF is built from, for
 * the selected study area and window, and it must show when AI interpretation
 * was not produced rather than implying it was.
 */

const BERLIN: SelectedLocation = { latitude: 52.52, longitude: 13.405, label: "Berlin" };

function section(title: string, overrides: Record<string, unknown> = {}) {
  return {
    title,
    available: true,
    body: null,
    items: [],
    unavailable_reason: null,
    ...overrides,
  };
}

function reportBody(overrides: Record<string, unknown> = {}) {
  return {
    report_id: "AQN-20261018-ABCD1234",
    generated_at: "2026-10-18T08:00:00Z",
    study_area_name: "Berlin",
    location: { latitude: 52.52, longitude: 13.405 },
    resolved_place: null,
    analysis_start: "2026-09-13",
    analysis_end: "2026-10-12",
    window_days: 30,
    completeness: "partial",
    completeness_note: "Reported as PARTIAL: at least one source is unavailable.",
    executive_summary: section("Executive summary", {
      items: ["Study area: Berlin at 52.5200, 13.4050."],
    }),
    observed_conditions: section("Observed environmental conditions"),
    rainfall_findings: section("Rainfall", {
      items: ["Rainfall anomaly: -8.1 %"],
    }),
    heat_findings: section("Heat"),
    flood_findings: section("Potential flood indicators", {
      available: false,
      unavailable_reason: "No modelled discharge or rainfall-based flood signal was available.",
    }),
    surface_water_findings: section("Surface water (satellite scene catalogue)"),
    dry_condition_findings: section("Dry conditions and water-stress signals"),
    data_quality: section("Data quality, coverage and confidence"),
    follow_up: section("Recommended follow-up"),
    ai_interpretation: section("AI-assisted interpretation", {
      available: false,
      unavailable_reason:
        "No AI provider is configured for this deployment, so no narrative was generated.",
    }),
    ai_generated: false,
    metrics: [
      {
        key: "rainfall_anomaly",
        label: "Rainfall anomaly",
        value: -8.1,
        unit: "%",
        status: "ok",
        classification: "derived",
        method: "Year-over-year comparison of ERA5 reanalysis.",
        note: null,
      },
    ],
    charts: [],
    sources: [
      {
        provider_id: "open_meteo_archive",
        provider_name: "Open-Meteo Historical Weather",
        status: "ok",
        classification: "reanalysis",
        product: "ERA5",
        url: "https://open-meteo.com/",
        attribution: "Open-Meteo",
        spatial_resolution: "~25 km",
        temporal_resolution: "hourly",
        units: "mm",
        limitations: [],
        message: null,
      },
    ],
    limitations: ["Rainfall deficit alone does not prove water scarcity."],
    citations: ["Open-Meteo Historical Weather — https://open-meteo.com/"],
    ...overrides,
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
    <WorkspaceProvider initialLocation={BERLIN}>
      <ReportPanel />
    </WorkspaceProvider>,
  );
}

describe("ReportPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("previews the report for the selected study area and period", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(reportBody()));

    renderPanel();

    expect(await screen.findByText("AquaNexus report")).toBeInTheDocument();
    expect(screen.getByText(/Berlin · 2026-09-13 → 2026-10-12/)).toBeInTheDocument();
    expect(screen.getByText("AQN-20261018-ABCD1234")).toBeInTheDocument();
    // The requested window must reach the backend, not a fixed template.
    const fetchMock = globalThis.fetch as unknown as {
      mock: { calls: unknown[][] };
    };
    const calledUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toContain("window_days=30");
    expect(calledUrl).toContain("latitude=52.52");
  });

  it("shows the real metrics and marks unavailable sections honestly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(reportBody()));

    renderPanel();

    expect(await screen.findByText("Rainfall anomaly")).toBeInTheDocument();
    expect(screen.getByText("Partial evidence")).toBeInTheDocument();
    // An unavailable section explains itself instead of vanishing.
    expect(
      screen.getByText(/no modelled discharge or rainfall-based flood signal/i),
    ).toBeInTheDocument();
  });

  it("states that AI interpretation was not generated", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(reportBody()));

    renderPanel();

    expect(
      await screen.findByText("AI interpretation not included"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no ai provider is configured/i),
    ).toBeInTheDocument();
  });

  it("prompts for a location before a report can be built", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(reportBody()));
    render(
      <WorkspaceProvider>
        <ReportPanel />
      </WorkspaceProvider>,
    );
    expect(screen.getByText(/select a location to build a report/i)).toBeInTheDocument();
  });

  it("offers a retry when the preview cannot be built", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "boom", message: "Preview failed" } }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderPanel();

    await waitFor(() =>
      expect(screen.getByText("Report preview unavailable")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
