import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MapUiProvider, useMapUi } from "@/lib/map-ui";

/**
 * Annotations are stored in localStorage, so the reader has to cope with data
 * written by an older build. These tests drive the real provider (no mocks) to
 * pin two behaviours that a rewrite could silently break:
 *
 * 1. An annotation saved before the water taxonomy existed loads with defaults
 *    instead of `undefined` values.
 * 2. A stored region-type / water-resource pair that no longer agrees is
 *    reconciled to the region type's own list, so the dialog can never open on
 *    a resource its group excludes.
 */

const KEY = "aquanexus.annotations.v1";

function Probe() {
  const { annotationFor } = useMapUi();
  const a = annotationFor("area-1");
  return (
    <div>
      <span data-testid="region">{a.regionType}</span>
      <span data-testid="resource">{a.waterResource}</span>
      <span data-testid="color">{a.color}</span>
    </div>
  );
}

function writeStored(value: unknown) {
  window.localStorage.setItem(KEY, JSON.stringify({ "area-1": value }));
}

afterEach(() => {
  window.localStorage.clear();
});

describe("annotation taxonomy storage", () => {
  it("fills the taxonomy defaults for an annotation saved before it existed", async () => {
    // Exactly the shape an older build wrote: no regionType / waterResource.
    writeStored({ type: "Point", category: "River basin", group: "Unassigned", color: "#3b82f6" });

    render(
      <MapUiProvider>
        <Probe />
      </MapUiProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("region").textContent).toBe("Natural Water"));
    expect(screen.getByTestId("resource").textContent).toBe("River Basin");
    // The legacy fields are preserved rather than reset.
    expect(screen.getByTestId("color").textContent).toBe("#3b82f6");
  });

  it("reconciles a resource that does not belong to the stored region type", async () => {
    // "Canal" belongs to Managed Water, not Natural Water.
    writeStored({
      type: "Point",
      category: "River basin",
      group: "Unassigned",
      color: "#3b82f6",
      regionType: "Natural Water",
      waterResource: "Canal",
    });

    render(
      <MapUiProvider>
        <Probe />
      </MapUiProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("region").textContent).toBe("Natural Water"));
    expect(screen.getByTestId("resource").textContent).toBe("River Basin");
  });

  it("keeps a resource that does belong to the stored region type", async () => {
    writeStored({
      type: "Area",
      category: "Lake or reservoir",
      group: "Monitoring",
      color: "#0ea5e9",
      regionType: "Managed Water",
      waterResource: "Canal",
    });

    render(
      <MapUiProvider>
        <Probe />
      </MapUiProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("region").textContent).toBe("Managed Water"));
    expect(screen.getByTestId("resource").textContent).toBe("Canal");
  });

  it("survives unreadable stored data without throwing", async () => {
    window.localStorage.setItem(KEY, "{not json");

    render(
      <MapUiProvider>
        <Probe />
      </MapUiProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("region").textContent).toBe("Natural Water"));
    expect(screen.getByTestId("resource").textContent).toBe("River Basin");
  });
});
