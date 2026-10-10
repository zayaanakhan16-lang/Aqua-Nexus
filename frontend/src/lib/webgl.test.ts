import { afterEach, describe, expect, it, vi } from "vitest";

import { detectWebGLSupport, probeWebGL } from "@/lib/webgl";

function fakeCanvas(getContext: (type: string) => unknown): HTMLCanvasElement {
  return { getContext } as unknown as HTMLCanvasElement;
}

describe("probeWebGL", () => {
  it("reports support when a webgl2 context is returned", () => {
    const canvas = fakeCanvas((type) =>
      type === "webgl2" ? { getParameter: () => "Acme" } : null,
    );
    expect(probeWebGL(canvas)).toEqual({ supported: true, reason: null });
  });

  it("falls back to the legacy webgl context type", () => {
    const canvas = fakeCanvas((type) =>
      type === "webgl" ? { getParameter: () => "Acme" } : null,
    );
    expect(probeWebGL(canvas).supported).toBe(true);
  });

  it("treats a Disabled vendor as unsupported", () => {
    const canvas = fakeCanvas(() => ({ getParameter: () => "Disabled" }));
    const result = probeWebGL(canvas);
    expect(result.supported).toBe(false);
    expect(result.reason).toMatch(/not available/i);
  });

  it("reports unsupported when no context type is available", () => {
    const canvas = fakeCanvas(() => null);
    expect(probeWebGL(canvas).supported).toBe(false);
  });

  it("reports unsupported when getContext throws", () => {
    const canvas = fakeCanvas(() => {
      throw new Error("no webgl");
    });
    expect(probeWebGL(canvas).supported).toBe(false);
  });
});

describe("detectWebGLSupport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ignores a canvas-wide vendor string and still reports support", () => {
    vi.spyOn(document, "createElement").mockReturnValue(
      fakeCanvas(() => ({ getParameter: () => "Acme" })),
    );
    expect(detectWebGLSupport().supported).toBe(true);
  });

  it("returns unsupported (without throwing) when canvas creation fails", () => {
    vi.spyOn(document, "createElement").mockImplementation(() => {
      throw new Error("blocked");
    });
    const result = detectWebGLSupport();
    expect(result.supported).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});
