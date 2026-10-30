import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IntelligenceTabs } from "@/components/workspace/IntelligenceTabs";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";

/**
 * Before a location is chosen the results surface must still be usable, so it
 * opens on the location-independent Global Layers tab. Choosing a location is
 * the moment analysis becomes meaningful, so the surface must then move to
 * Overview by itself.
 */

function SelectButton() {
  const { selectLocation } = useWorkspace();
  return (
    <button
      type="button"
      onClick={() => selectLocation({ latitude: 6.45, longitude: 3.39, label: "Lagos" })}
    >
      select
    </button>
  );
}

function selectedTab(label: string) {
  const tab = screen.getByRole("tab", { name: label });
  return tab.getAttribute("aria-selected") === "true";
}

describe("IntelligenceTabs default surface", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens on Global Layers with no location, then switches to Overview once one is chosen", async () => {
    // Every provider call fails: the tab contract must not depend on data.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "x", message: "unavailable" } }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <WorkspaceProvider>
        <SelectButton />
        <IntelligenceTabs />
      </WorkspaceProvider>,
    );

    expect(selectedTab("Global Layers")).toBe(true);
    expect(selectedTab("Overview")).toBe(false);

    await act(async () => {
      screen.getByText("select").click();
      await Promise.resolve();
    });

    expect(selectedTab("Overview")).toBe(true);
    expect(selectedTab("Global Layers")).toBe(false);
  });
});

describe("Investigation progress", () => {
  it("reports completion from real slice states, not a simulated timer", async () => {
    // Every provider call fails, so every stage settles with a failure: the
    // strip must say so rather than claiming the investigation succeeded.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "x", message: "unavailable" } }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <WorkspaceProvider>
        <SelectButton />
        <IntelligenceTabs />
      </WorkspaceProvider>,
    );

    await act(async () => {
      screen.getByText("select").click();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText(/investigation complete/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/stage.* could not reach its source/i)).toBeInTheDocument();
  });
});
