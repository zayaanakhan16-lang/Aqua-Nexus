import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WaterAtlasMap } from "@/components/map/WaterAtlasMap";
import { WorkspaceProvider } from "@/lib/workspace";

// jsdom cannot create a WebGL context, so the real probe reports unavailable.
// This pins the fallback contract: the map panel must explain the situation and
// stay usable instead of throwing and taking the page down.

function renderMap() {
  return render(
    <WorkspaceProvider>
      <WaterAtlasMap />
    </WorkspaceProvider>,
  );
}

describe("WaterAtlasMap WebGL fallback", () => {
  it("shows the accessible fallback instead of crashing when WebGL is unavailable", () => {
    expect(() => renderMap()).not.toThrow();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Interactive map unavailable")).toBeInTheDocument();
    expect(screen.getByText(/cannot create a WebGL context/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry map/i })).toBeInTheDocument();
  });
});
