import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkspaceProvider, useWorkspace, type SelectedLocation } from "@/lib/workspace";

/**
 * The workspace store is the single source of truth for the selected location.
 * Two guarantees matter for correctness and are pinned here against the real
 * provider: (1) choosing a new location clears the previous results instead of
 * showing them against the new place, and (2) a slow response from an old
 * location can never overwrite the newer one.
 */

const BERLIN: SelectedLocation = { latitude: 52.52, longitude: 13.4, label: "Berlin" };
const LAGOS: SelectedLocation = { latitude: 6.45, longitude: 3.39, label: "Lagos" };

function seriesBody(total: number) {
  return {
    location: { latitude: 0, longitude: 0 },
    start_date: "2026-01-01",
    end_date: "2026-01-02",
    granularity: "daily",
    unit: "mm",
    points: [{ timestamp: "2026-01-01T12:00:00Z", value: total, unit: "mm" }],
    provenance: {
      source_id: "open_meteo_archive",
      source_name: "ERA5",
      classification: "reanalysis",
      retrieved_at: "2026-01-02T12:00:00Z",
    },
    provider: { id: "open_meteo_archive", name: "ERA5", classification: "reanalysis" },
    missing_days: 0,
    total,
  };
}

function summaryBody(label: string) {
  return {
    location: { latitude: 0, longitude: 0 },
    label,
    generated_at: "2026-01-02T12:00:00Z",
    providers: [
      {
        provider_id: "open_meteo_archive",
        provider_name: "Open-Meteo Historical Weather",
        status: "ok",
        classification: "reanalysis",
      },
    ],
    indicators: [],
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function Harness() {
  const { location, summary, selectLocation, clearLocation } = useWorkspace();
  return (
    <div>
      <span data-testid="label">{location?.label ?? "none"}</span>
      <span data-testid="summary-label">{summary.data?.label ?? "none"}</span>
      <span data-testid="summary-loading">{String(summary.loading)}</span>
      <button type="button" onClick={() => selectLocation(BERLIN)}>
        select-berlin
      </button>
      <button type="button" onClick={() => selectLocation(LAGOS)}>
        select-lagos
      </button>
      <button type="button" onClick={clearLocation}>
        clear
      </button>
    </div>
  );
}

function renderHarness() {
  return render(
    <WorkspaceProvider>
      <Harness />
    </WorkspaceProvider>,
  );
}

describe("workspace store location changes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clears previous results while a new location loads", async () => {
    const berlinSummary = deferred<Response>();
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/location/summary")) return berlinSummary.promise;
      if (url.includes("/precipitation/comparison")) return Promise.resolve(json(seriesBody(1)));
      return Promise.resolve(json(seriesBody(1)));
    });

    renderHarness();
    act(() => screen.getByText("select-berlin").click());

    // Resolve the summary so Berlin has data.
    await act(async () => {
      berlinSummary.resolve(json(summaryBody("Berlin")));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId("summary-label")).toHaveTextContent("Berlin"));

    // Now select a different location; the store must drop the old summary
    // immediately rather than showing it against Lagos.
    act(() => screen.getByText("select-lagos").click());

    expect(screen.getByTestId("label")).toHaveTextContent("Lagos");
    expect(screen.getByTestId("summary-label")).toHaveTextContent("none");
    expect(screen.getByTestId("summary-loading")).toHaveTextContent("true");
  });

  it("does not let a slow old-location response overwrite the newer one", async () => {
    const berlinSummary = deferred<Response>();
    const lagosSummary = deferred<Response>();

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/location/summary")) {
        return url.includes("latitude=6.45") ? lagosSummary.promise : berlinSummary.promise;
      }
      return Promise.resolve(json(seriesBody(1)));
    });

    renderHarness();
    act(() => screen.getByText("select-berlin").click());
    await act(async () => {
      await Promise.resolve();
    });

    // Switch to Lagos before Berlin resolves.
    act(() => screen.getByText("select-lagos").click());
    await act(async () => {
      await Promise.resolve();
    });

    // Lagos resolves first…
    await act(async () => {
      lagosSummary.resolve(json(summaryBody("Lagos")));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId("summary-label")).toHaveTextContent("Lagos"));

    // …then the superseded Berlin response arrives late and must be ignored.
    await act(async () => {
      berlinSummary.resolve(json(summaryBody("Berlin")));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("summary-label")).toHaveTextContent("Lagos");
  });
});
