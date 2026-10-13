import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AIAnalysisPanel } from "@/components/panels/AIAnalysisPanel";
import type { AIAnalysisReport } from "@/lib/schemas";
import type { SliceState } from "@/lib/workspace";

function slice(data: AIAnalysisReport | null): SliceState<AIAnalysisReport> {
  return { data, loading: false, error: null, errorCode: null };
}

const EVIDENCE = {
  location: { latitude: 6.45, longitude: 3.39 },
  label: "Lagos",
  resolved_place: null,
  generated_at: "2026-10-12T09:00:00Z",
  observations: [
    {
      key: "rainfall_anomaly",
      label: "Rainfall anomaly",
      value: -12.0,
      unit: "mm",
      status: "ok",
      classification: "derived" as const,
      period: "2026-09-01 to 2026-09-30",
      source: "Location summary",
    },
  ],
  providers: [],
  available: ["Open-Meteo Archive"],
  missing: ["Modelled river discharge"],
  notes: [],
};

describe("AIAnalysisPanel", () => {
  it("offers a generate action before any analysis exists", () => {
    const onGenerate = vi.fn();
    render(<AIAnalysisPanel slice={slice(null)} onGenerate={onGenerate} />);
    expect(screen.getByRole("button", { name: /generate analysis/i })).toBeInTheDocument();
  });

  it("renders the narrative when analysis succeeds", () => {
    render(
      <AIAnalysisPanel
        slice={slice({
          status: "ok",
          provider: "AI analysis",
          model: "test-model",
          evidence: EVIDENCE,
          narrative: {
            situation_summary: "The window is near normal.",
            observed_conditions: ["Rainfall anomaly -12.0 mm"],
            recent_changes: [],
            potential_concerns: ["A rainfall deficit is present"],
            confidence_and_limitations: ["Reanalysis, not gauges"],
            investigate_next: [],
            recommended_next_steps: ["Continue monitoring"],
          },
        })}
        onGenerate={vi.fn()}
      />,
    );
    expect(screen.getByText(/near normal/i)).toBeInTheDocument();
    expect(screen.getByText("A rainfall deficit is present")).toBeInTheDocument();
    // Interpretation is labelled, not presented as measurement.
    expect(screen.getByText(/not a\s+measurement/i)).toBeInTheDocument();
  });

  it("shows an honest unconfigured state but still surfaces the evidence", () => {
    render(
      <AIAnalysisPanel
        slice={slice({
          status: "unconfigured",
          provider: "AI analysis",
          model: null,
          evidence: EVIDENCE,
          narrative: null,
          message: "AI analysis is not configured for this deployment.",
        })}
        onGenerate={vi.fn()}
      />,
    );
    expect(screen.getByText(/AI analysis unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /evidence used \(1\)/i })).toBeInTheDocument();
  });
});
