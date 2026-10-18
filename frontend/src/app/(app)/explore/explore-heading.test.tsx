import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ExploreClient from "@/app/(app)/explore/ExploreClient";

/**
 * The Explore workspace is a full-bleed map with no visible page title, so it
 * must still expose a single top-level heading for screen-reader orientation.
 */
describe("Explore workspace heading", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes exactly one h1 naming the workspace", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "x", message: "unavailable" } }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<ExploreClient />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(/explore map/i);
  });
});
