import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WaterScenarioSimulator } from "@/components/panels/WaterScenarioSimulator";
import type { SliceState } from "@/lib/workspace";
import type { PrecipitationSeries } from "@/lib/schemas";

/**
 * The simulator is the one place on the planning surface that turns assumptions
 * into numbers, so its two honesty guarantees are pinned here:
 *
 * 1. It is labelled illustrative, and says which input is measured and which is
 *    assumed.
 * 2. With no rainfall series it shows an unavailable state and no readouts,
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

describe("WaterScenarioSimulator", () => {
  it("labels the scenario illustrative and names the measured input", () => {
    render(<WaterScenarioSimulator history={historyWith(DAYS)} areaKm2={10} />);
    expect(screen.getByText(/illustrative scenario/i)).toBeInTheDocument();
    expect(screen.getByText(/rainfall totals are measured/i)).toBeInTheDocument();
  });

  it("shows no balance when the rainfall series is missing", () => {
    render(<WaterScenarioSimulator history={historyWith([])} areaKm2={10} />);
    expect(screen.getByText(/no rainfall series available/i)).toBeInTheDocument();
    // No readouts at all: a balance from an absent series would be invented.
    expect(screen.queryByText(/annual balance/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("recomputes the balance when an assumption changes", () => {
    render(<WaterScenarioSimulator history={historyWith(DAYS)} areaKm2={10} />);
    const slider = screen.getByLabelText(/crop water requirement/i);
    // With 50 mm of measured rain and 10 km², a 60 mm/month requirement over 20%
    // of the area is a surplus; raising demand to 200 mm over 100% is not.
    fireEvent.change(screen.getByLabelText(/irrigated share/i), { target: { value: "1" } });
    fireEvent.change(slider, { target: { value: "200" } });
    expect(screen.getByText(/deficit/i)).toBeInTheDocument();
  });

  it("falls back to a depth when the region area is unknown", () => {
    render(<WaterScenarioSimulator history={historyWith(DAYS)} areaKm2={null} />);
    // 20 mm + 30 mm measured, captured at 30% by default -> 15 mm supply, shown as
    // a depth rather than a blank because no area was drawn.
    expect(screen.getByText("15 mm")).toBeInTheDocument();
    expect(screen.getByText(/millimetres only/i)).toBeInTheDocument();
  });

  it("restores the defaults on reset", () => {
    render(<WaterScenarioSimulator history={historyWith(DAYS)} areaKm2={10} />);
    const share = screen.getByLabelText(/irrigated share/i) as HTMLInputElement;
    fireEvent.change(share, { target: { value: "0.8" } });
    expect(share.value).toBe("0.8");
    fireEvent.click(screen.getByRole("button", { name: /reset assumptions/i }));
    expect(share.value).toBe("0.2");
  });
});
