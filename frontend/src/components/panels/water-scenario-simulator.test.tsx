import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WaterScenarioSimulator } from "@/components/panels/WaterScenarioSimulator";
import type { SliceState } from "@/lib/workspace";
import type { PrecipitationSeries } from "@/lib/schemas";

/**
 * The digital twin is the one place on the planning surface that turns
 * assumptions into numbers, so its honesty guarantees are pinned here:
 *
 * 1. Observed mode is a restatement of the measured series, with no simulation
 *    badge and no claim of a scenario.
 * 2. Simulated mode carries the explicit "SIMULATION — NOT A REAL OBSERVATION"
 *    badge and says every figure is a scenario output.
 * 3. With no rainfall series it shows an unavailable state and no readouts,
 *    rather than computing a balance from nothing.
 */

function historyWith(points: PrecipitationSeries["points"]): SliceState<PrecipitationSeries> {
  return {
    data: { points } as unknown as PrecipitationSeries,
    loading: false,
    error: null,
    errorCode: null,
  };
}

const DAYS = [
  { timestamp: "2026-01-05T12:00:00Z", value: 20, unit: "mm" },
  { timestamp: "2026-02-05T12:00:00Z", value: 30, unit: "mm" },
];

describe("WaterScenarioSimulator (digital twin)", () => {
  it("opens in observed mode, naming the measured input and claiming no scenario", () => {
    render(<WaterScenarioSimulator history={historyWith(DAYS)} areaKm2={10} />);
    expect(screen.getByText(/rainfall totals are measured/i)).toBeInTheDocument();
    expect(screen.getByText(/no assumption applied/i)).toBeInTheDocument();
    expect(screen.queryByTestId("simulation-badge")).not.toBeInTheDocument();
  });

  it("shows the simulation badge and the scenario disclaimer once a scenario is chosen", () => {
    render(<WaterScenarioSimulator history={historyWith(DAYS)} areaKm2={10} />);
    fireEvent.click(screen.getByRole("button", { name: /drought conditions/i }));

    expect(screen.getByTestId("simulation-badge")).toHaveTextContent(
      /SIMULATION — NOT A REAL OBSERVATION/i,
    );
    expect(screen.getByText(/every figure below is a scenario output/i)).toBeInTheDocument();
    expect(screen.queryByText(/no assumption applied/i)).not.toBeInTheDocument();
  });

  it("returns to observed mode when the observed-rainfall preset is chosen again", () => {
    render(<WaterScenarioSimulator history={historyWith(DAYS)} areaKm2={10} />);
    fireEvent.click(screen.getByRole("button", { name: /drought conditions/i }));
    expect(screen.getByTestId("simulation-badge")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /observed rainfall/i }));
    expect(screen.queryByTestId("simulation-badge")).not.toBeInTheDocument();
    expect(screen.getByText(/no assumption applied/i)).toBeInTheDocument();
  });

  it("flags a hand-adjusted scenario as custom rather than presenting it as a preset", () => {
    render(<WaterScenarioSimulator history={historyWith(DAYS)} areaKm2={10} />);
    expect(screen.queryByText(/custom scenario/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/irrigated share/i), { target: { value: "0.8" } });
    expect(screen.getByText(/custom scenario/i)).toBeInTheDocument();
  });

  it("shows no balance when the rainfall series is missing", () => {
    render(<WaterScenarioSimulator history={historyWith([])} areaKm2={10} />);
    expect(screen.getByText(/no rainfall series available/i)).toBeInTheDocument();
    // No readouts and no comparison at all: a balance from an absent series
    // would be invented.
    expect(screen.queryByText(/annual balance/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/scenario comparison/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("compares the scenario against the observed baseline from the same series", () => {
    render(<WaterScenarioSimulator history={historyWith(DAYS)} areaKm2={10} />);
    // Drought scales the measured months to 50% and captures 20%, so the scenario
    // supply (5 mm) is below the observed baseline (15 mm).
    fireEvent.click(screen.getByRole("button", { name: /drought conditions/i }));

    expect(screen.getByText(/scenario comparison/i)).toBeInTheDocument();
    expect(screen.getAllByText("15 mm").length).toBeGreaterThan(0);
    expect(screen.getAllByText("5 mm").length).toBeGreaterThan(0);
    expect(screen.getByText(/both columns use the same measured series/i)).toBeInTheDocument();
  });

  it("falls back to a depth when the region area is unknown", () => {
    render(<WaterScenarioSimulator history={historyWith(DAYS)} areaKm2={null} />);
    // 20 mm + 30 mm measured, captured at 30% by default -> 15 mm supply, shown as
    // a depth rather than a blank because no area was drawn.
    expect(screen.getAllByText("15 mm").length).toBeGreaterThan(0);
    expect(screen.getByText(/millimetres only/i)).toBeInTheDocument();
  });

  it("restores the defaults on reset", () => {
    render(<WaterScenarioSimulator history={historyWith(DAYS)} areaKm2={10} />);
    const share = screen.getByLabelText(/irrigated share/i) as HTMLInputElement;
    fireEvent.change(share, { target: { value: "0.8" } });
    expect(share.value).toBe("0.8");
    fireEvent.click(screen.getByRole("button", { name: /reset scenario/i }));
    expect(share.value).toBe("0.2");
  });
});
