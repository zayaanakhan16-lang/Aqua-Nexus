import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FloodPanel } from "@/components/panels/FloodPanel";
import { WaterPresencePanel } from "@/components/panels/WaterPresencePanel";
import { WaterAtlasPanel } from "@/components/panels/WaterAtlasPanel";
import { WorkspaceProvider } from "@/lib/workspace";
import type {
  FloodEvidenceResult,
  WaterBodyResult,
  WaterPresenceResult,
} from "@/lib/schemas";

/**
 * The water-intelligence panels carry the project's scientific-integrity
 * contract, so these tests pin the guarantees that matter most:
 *
 * - "insufficient evidence" is never rendered as "no water";
 * - rainfall signals are never presented as a flood;
 * - a mapping-service failure is never rendered as "no water bodies exist";
 * - every observation exposes its source and limitations.
 */

function presence(overrides: Partial<WaterPresenceResult> = {}): WaterPresenceResult {
  return {
    location: { latitude: -1, longitude: 33 },
    generated_at: "2026-10-30T00:00:00Z",
    status: "insufficient_evidence",
    headline: "Insufficient evidence",
    detail: "Neither source returned usable data.",
    observations: [
      {
        source_id: "osm_overpass",
        source_name: "OpenStreetMap water features",
        product: "OpenStreetMap via the Overpass API",
        classification: "observation",
        observed_at: null,
        spatial_resolution: "Contributor-mapped vector geometry",
        method: "Mapped water-feature lookup within the search radius.",
        method_version: "1.0",
        detected: null,
        coverage_fraction: null,
        value: null,
        unit: null,
        confidence: null,
        limitations: ["This is mapping data, not a hydrological survey."],
      },
    ],
    providers: [
      {
        provider_id: "osm_overpass",
        provider_name: "OpenStreetMap water features",
        status: "unavailable",
        message: "unreachable",
        classification: "observation",
        preliminary: false,
      },
    ],
    evidence_count: 0,
    notes: ["Observed/mapped surface water is reported here only."],
    ...overrides,
  } as WaterPresenceResult;
}

function flood(overrides: Partial<FloodEvidenceResult> = {}): FloodEvidenceResult {
  return {
    location: { latitude: -1, longitude: 33 },
    generated_at: "2026-10-30T00:00:00Z",
    status: "heavy_rainfall_signal",
    headline: "Heavy-rainfall signal",
    detail: "Heavy rainfall is present in the available evidence (2 forecast days).",
    items: [
      {
        key: "forecast_heavy_rainfall",
        label: "Forecast heavy-rainfall days (>= 20 mm/day)",
        evidence_type: "rainfall_signal",
        status: "ok",
        value: 2,
        unit: "days",
        period: "next 7 days",
        source: "Open-Meteo Forecast",
        classification: "forecast",
        method: "count(forecast daily precipitation >= 20 mm). A modelled rainfall signal.",
        limitations: ["Heavy forecast rainfall is not a flood probability."],
      },
    ],
    providers: [],
    disclaimer:
      "Evidence-based screening only. AquaNexus does not operate a validated flood forecast model and is not an official flood warning service.",
    notes: [],
    ...overrides,
  } as FloodEvidenceResult;
}

function bodies(overrides: Partial<WaterBodyResult> = {}): WaterBodyResult {
  return {
    location: { latitude: 6.44, longitude: 3.4 },
    radius_m: 15000,
    count: 0,
    bodies: [],
    provider: {
      provider_id: "osm_overpass",
      provider_name: "OpenStreetMap water features",
      status: "unavailable",
      message: "unreachable",
      classification: "observation",
      preliminary: false,
    },
    note: "No water-feature data is shown because the service could not be reached.",
    service_reachable: false,
    ...overrides,
  } as WaterBodyResult;
}

const noop = vi.fn();

describe("WaterPresencePanel", () => {
  it("never renders insufficient evidence as 'no water'", () => {
    render(
      <WorkspaceProvider>
        <WaterPresencePanel slice={{ data: presence(), loading: false, error: null, errorCode: null }} onRetry={noop} />
      </WorkspaceProvider>,
    );
    expect(screen.getByText("Insufficient evidence")).toBeTruthy();
    expect(
      screen.getByText(/This is not evidence that water is absent/i),
    ).toBeTruthy();
    expect(screen.queryByText(/^No water detected$/i)).toBeNull();
  });

  it("shows each observation's source and limitations", () => {
    render(
      <WorkspaceProvider>
        <WaterPresencePanel slice={{ data: presence(), loading: false, error: null, errorCode: null }} onRetry={noop} />
      </WorkspaceProvider>,
    );
    expect(screen.getAllByText("OpenStreetMap water features").length).toBeGreaterThan(0);
    expect(screen.getByText(/not a hydrological survey/i)).toBeTruthy();
  });
});

describe("FloodPanel", () => {
  it("labels rainfall signals as rainfall, not flooding", () => {
    render(
      <WorkspaceProvider>
        <FloodPanel slice={{ data: flood(), loading: false, error: null, errorCode: null }} onRetry={noop} />
      </WorkspaceProvider>,
    );
    expect(screen.getByText("Heavy-rainfall signal")).toBeTruthy();
    expect(screen.getByText(/Rainfall alone does not prove a flood/i)).toBeTruthy();
    expect(screen.getByText(/not an official flood warning service/i)).toBeTruthy();
  });
});

describe("WaterAtlasPanel", () => {
  it("reports a service failure as a coverage gap, not as 'no water bodies'", () => {
    render(
      <WorkspaceProvider>
        <WaterAtlasPanel slice={{ data: bodies(), loading: false, error: null, errorCode: null }} onRetry={noop} />
      </WorkspaceProvider>,
    );
    expect(screen.getByText(/Mapping service did not answer/i)).toBeTruthy();
    expect(screen.getByText(/coverage failure, not evidence that no water bodies exist/i)).toBeTruthy();
  });

  it("lists mapped features with their kind when the service answers", () => {
    const result = bodies({
      count: 1,
      service_reachable: true,
      provider: {
        provider_id: "osm_overpass",
        provider_name: "OpenStreetMap water features",
        status: "ok",
        message: "ok",
        classification: "observation",
        preliminary: false,
      },
      bodies: [
        {
          id: "way/1",
          name: "Lagos Lagoon",
          kind: "lake",
          coordinates: [],
          bbox: { west: 3.3, south: 6.4, east: 3.5, north: 6.5 },
          area_km2: 12.5,
          tags: {},
          source_id: "osm_overpass",
        },
      ],
    });
    render(
      <WorkspaceProvider>
        <WaterAtlasPanel slice={{ data: result, loading: false, error: null, errorCode: null }} onRetry={noop} />
      </WorkspaceProvider>,
    );
    expect(screen.getByText("Lagos Lagoon")).toBeTruthy();
    expect(screen.getByText(/1 feature found/i)).toBeTruthy();
  });
});
