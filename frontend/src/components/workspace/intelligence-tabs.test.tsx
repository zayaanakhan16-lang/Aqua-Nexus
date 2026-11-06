import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IntelligenceTabs } from "@/components/workspace/IntelligenceTabs";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";

/**
 * Before a location is chosen the results surface must still be usable, so it
 * opens on the location-independent Global Layers section. Choosing a location
 * is the moment analysis becomes meaningful, so the surface must then move to
 * the Overview section by itself.
 *
 * Navigation is two-level: the eight primary destinations live in the top bar
 * (`shell/TopNav`) and this surface shows only the sections of the group it is
 * currently in. These assertions therefore read the group the surface reports
 * itself to be in, which is the visible equivalent of the old flat tab state.
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

/** The primary group the surface currently reports itself to be in. */
function activeGroup(): string {
  return screen.getByText(/water intelligence/i).closest("div")!.querySelector("p")!.textContent!;
}

describe("IntelligenceTabs default surface", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens on a location-independent section, then switches to Overview once a location is chosen", async () => {
    // Every provider call fails: the section contract must not depend on data.
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

    // Global Layers is reachable with no location and lives in the Watersheds
    // group; the Overview section is not the default.
    expect(activeGroup()).toMatch(/watersheds/i);

    await act(async () => {
      screen.getByText("select").click();
      await Promise.resolve();
    });

    expect(activeGroup()).toMatch(/overview/i);
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
