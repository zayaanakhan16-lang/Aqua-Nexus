import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WaterProfilePanel } from "@/components/panels/WaterProfilePanel";
import { WaterPlanningPanel } from "@/components/panels/WaterPlanningPanel";
import { MapUiProvider } from "@/lib/map-ui";
import type { SliceState } from "@/lib/workspace";
import type { LocationSummary, StudyArea } from "@/lib/schemas";

/**
 * These panels exist to make gaps visible. The tests pin the two guarantees
 * that matter for honesty:
 *
 * 1. A category with no connected provider reports an explicit unavailable
 *    state and carries no numeric value — it is never filled with a guess.
 * 2. Recommendations are labelled illustrative, and each states the signal it
 *    came from, so a planning prompt is never mistaken for measured advice.
 */

const AREA: StudyArea = {
  id: "area-1",
  name: "Test Basin",
  location: { latitude: 6.5, longitude: 3.4 },
  label: "Lagos",
  place: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

function slice<T>(data: T | null): SliceState<T> {
  return { data, loading: false, error: null, errorCode: null };
}

/** An empty slice for any payload type, inferred from the prop it fills. */
function none<T>(): SliceState<T> {
  return { data: null, loading: false, error: null, errorCode: null };
}

function summary(overrides: Partial<LocationSummary> = {}): LocationSummary {
  return {
    location: { latitude: 6.5, longitude: 3.4 },
    label: "Lagos",
    resolved_place: null,
    generated_at: "2026-10-18T08:00:00Z",
    providers: [
      {
        provider_id: "open_meteo",
        provider_name: "Open-Meteo",
        status: "ok",
        message: null,
        classification: "forecast",
        preliminary: false,
      },
      {
        provider_id: "nasa_power",
        provider_name: "NASA POWER",
        status: "unavailable",
        message: "No response",
        classification: null,
        preliminary: false,
      },
    ],
    indicators: [
      {
        key: "rainfall_anomaly",
        label: "Rainfall anomaly",
        value: -22.5,
        unit: "%",
        status: "ok",
        baseline: null,
        method: "Prior-year comparison",
        method_version: "1.0",
        inputs: [],
        limitations: [],
        classification: "derived",
      },
      {
        key: "wet_day_fraction",
        label: "Wet-day fraction",
        value: 0.18,
        unit: "fraction",
        status: "ok",
        baseline: null,
        method: "Days with rain over window",
        method_version: "1.0",
        inputs: [],
        limitations: [],
        classification: "derived",
      },
    ],
    notes: [],
    ...overrides,
  };
}

function renderProfile(overrides: { summary?: SliceState<ReturnType<typeof summary>> } = {}) {
  return render(
    <MapUiProvider>
      <WaterProfilePanel
        area={AREA}
        areaKm2={1240.5}
        summary={overrides.summary ?? slice(summary())}
        weather={none()}
        discharge={none()}
        waterBodies={none()}
        waterPresence={none()}
        onRetry={vi.fn()}
      />
    </MapUiProvider>,
  );
}

describe("WaterProfilePanel", () => {
  it("reports groundwater and water quality as unavailable with no value", () => {
    renderProfile();

    expect(screen.getByText("Groundwater")).toBeTruthy();
    expect(screen.getByText("Water quality")).toBeTruthy();
    // Both categories explain the absence rather than showing a figure.
    expect(screen.getByText(/Groundwater level and storage are not connected/i)).toBeTruthy();
    expect(screen.getByText(/Water-quality indicators .* are not connected/i)).toBeTruthy();
    // The specific parameters a quality source would report are named, so the
    // gap is legible rather than a vague "not available".
    for (const p of ["pH", "turbidity", "dissolved oxygen", "nitrates", "salinity"]) {
      expect(screen.getByText(new RegExp(p, "i"))).toBeTruthy();
    }
  });

  it("refuses to classify water suitability without measured data", () => {
    renderProfile();

    expect(screen.getByText("Water suitability")).toBeTruthy();
    // The exact honest-state sentence the spec requires, plus the reason.
    expect(
      screen.getByText(/Insufficient water-quality data to determine suitability/i),
    ).toBeTruthy();
    expect(screen.getByText(/satellite imagery alone cannot establish/i)).toBeTruthy();
  });

  it("shows the region identity, area and water taxonomy", () => {
    renderProfile();

    expect(screen.getByText("Test Basin")).toBeTruthy();
    expect(screen.getByText(/1,240.5 km²/)).toBeTruthy();
    // Default annotation taxonomy is surfaced as chips.
    expect(screen.getByText("Natural Water")).toBeTruthy();
    expect(screen.getByText("River Basin")).toBeTruthy();
  });

  it("lists each connected provider with its status", () => {
    renderProfile();

    expect(screen.getByText("Open-Meteo")).toBeTruthy();
    expect(screen.getByText("NASA POWER")).toBeTruthy();
    expect(screen.getByText("1 of 2 sources")).toBeTruthy();
  });

  it("surfaces the provider error instead of hiding it", () => {
    renderProfile({
      summary: { data: null, loading: false, error: "Provider request failed", errorCode: "upstream" },
    });

    expect(screen.getByText("Provider request failed")).toBeTruthy();
  });
});

describe("WaterPlanningPanel", () => {
  it("labels recommendations as illustrative and cites their signal", () => {
    render(
      <MapUiProvider>
        <WaterPlanningPanel
          area={AREA}
          areaKm2={1240.5}
          summary={slice(summary())}
          weather={none()}
          discharge={none()}
          waterBodies={none()}
          windowDays={14}
          onWindowChange={vi.fn()}
        />
      </MapUiProvider>,
    );

    expect(screen.getByText(/illustrative planning prompts/i)).toBeTruthy();
    // A below-baseline rainfall anomaly triggers the harvesting prompt, and the
    // card states the value it was derived from.
    expect(screen.getByText("Rainwater harvesting")).toBeTruthy();
    expect(screen.getByText(/Rainfall anomaly for the selected window is -22.5%/)).toBeTruthy();
    expect(screen.getByText(/Derived from the rainfall anomaly indicator/i)).toBeTruthy();
  });

  it("states that groundwater is not connected rather than implying it is", () => {
    render(
      <MapUiProvider>
        <WaterPlanningPanel
          area={AREA}
          areaKm2={null}
          summary={slice(summary())}
          weather={none()}
          discharge={none()}
          waterBodies={none()}
          windowDays={14}
          onWindowChange={vi.fn()}
        />
      </MapUiProvider>,
    );

    expect(screen.getByText("Groundwater not connected")).toBeTruthy();
    expect(screen.getByText(/no groundwater source is connected/i)).toBeTruthy();
  });

  it("renders the seasonal planning table with all four seasons", () => {
    render(
      <MapUiProvider>
        <WaterPlanningPanel
          area={AREA}
          areaKm2={null}
          summary={slice(summary())}
          weather={none()}
          discharge={none()}
          waterBodies={none()}
          windowDays={14}
          onWindowChange={vi.fn()}
        />
      </MapUiProvider>,
    );

    expect(screen.getByText("Seasonal water planning")).toBeTruthy();
    for (const season of ["Winter", "Spring", "Summer", "Autumn"]) {
      expect(screen.getByText(season)).toBeTruthy();
    }
    // The frame is explicitly not a forecast.
    expect(screen.getByText(/not a forecast/i)).toBeTruthy();
  });

  it("labels expert tips as general suggestions, not local guidance", () => {
    render(
      <MapUiProvider>
        <WaterPlanningPanel
          area={AREA}
          areaKm2={1240.5}
          summary={slice(summary())}
          weather={none()}
          discharge={none()}
          waterBodies={none()}
          windowDays={14}
          onWindowChange={vi.fn()}
        />
      </MapUiProvider>,
    );

    expect(screen.getByText("Expert tips")).toBeTruthy();
    expect(screen.getByText(/suggestions, not local advice/i)).toBeTruthy();
    expect(screen.getByText(/not verified local guidance/i)).toBeTruthy();
  });
});
