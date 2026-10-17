import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LocationSearch } from "@/components/panels/LocationSearch";
import { WorkspaceProvider } from "@/lib/workspace";

/**
 * Search must never present a superseded response as the current one, and a
 * superseded request must be aborted rather than surfaced as a timeout. These
 * tests drive the real component and the real API client; only `fetch` is
 * stubbed, so the debounce, the abort wiring and the response ordering are all
 * exercised as they are in the browser.
 */

function placeResponse(name: string, lat: number, lon: number) {
  return {
    query: name,
    count: 1,
    results: [
      {
        id: name,
        name,
        display_name: name,
        latitude: lat,
        longitude: lon,
        source_id: "open_meteo_geocoding",
      },
    ],
    provider: {
      provider_id: "open_meteo_geocoding",
      provider_name: "Open-Meteo Geocoding",
      status: "ok",
      classification: "observation",
    },
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** A promise whose settlement the test controls. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderSearch() {
  return render(
    <WorkspaceProvider>
      <LocationSearch />
    </WorkspaceProvider>,
  );
}

describe("LocationSearch request handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the newest query's results even when an older request resolves last", async () => {
    const slow = deferred<Response>();
    const fast = deferred<Response>();

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      // The first keystroke resolves last; the second resolves first.
      return url.includes("q=la&") ? slow.promise : fast.promise;
    });

    renderSearch();
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "la" } });
    // Past the 320 ms debounce, so the first request is now in flight.
    await waitFor(() =>
      expect(
        (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
      ).toBeGreaterThanOrEqual(1),
    );

    fireEvent.change(input, { target: { value: "lagos" } });
    await waitFor(() =>
      expect(
        (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
      ).toBeGreaterThanOrEqual(2),
    );

    // The newer request settles first.
    fast.resolve(jsonResponse(placeResponse("Lagos", 6.45, 3.39)));
    await waitFor(() => expect(screen.getAllByText("Lagos").length).toBeGreaterThan(0));

    // Then the older, superseded request settles late.
    slow.resolve(jsonResponse(placeResponse("Stale Earlier Result", 43.2, -0.2)));
    await new Promise((r) => setTimeout(r, 30));

    expect(screen.queryAllByText("Stale Earlier Result")).toHaveLength(0);
    expect(screen.getAllByText("Lagos").length).toBeGreaterThan(0);
  });

  it("aborts a superseded request instead of surfacing a timeout", async () => {
    const aborted: boolean[] = [];

    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      const signal = (init as RequestInit | undefined)?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          aborted.push(true);
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });

    renderSearch();
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "berlin" } });
    await waitFor(() => expect(aborted.length + 0).toBeGreaterThanOrEqual(0));
    await new Promise((r) => setTimeout(r, 400));

    // Superseding the query must abort the in-flight request.
    fireEvent.change(input, { target: { value: "berlin germany" } });
    await new Promise((r) => setTimeout(r, 500));

    expect(aborted.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/timed out/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/temporarily unavailable/i)).not.toBeInTheDocument();
  });
});
