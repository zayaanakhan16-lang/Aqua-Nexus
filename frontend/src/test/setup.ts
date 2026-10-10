import "@testing-library/jest-dom/vitest";

// MapLibre and ResizeObserver are not available in jsdom; provide inert stubs
// so component tests can mount without touching WebGL.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
  ResizeObserverStub;

// MapLibre creates a worker URL from a Blob at import time. jsdom's URL lacks
// createObjectURL, so importing the library would throw before any test runs.
// An inert stub keeps the module importable; the fallback path under test never
// starts worker-backed tile loading.
if (typeof window.URL.createObjectURL !== "function") {
  window.URL.createObjectURL = () => "blob:aquanexus-test";
  window.URL.revokeObjectURL = () => {};
}

// jsdom has no graphics backend: HTMLCanvasElement.getContext returns null (and
// logs a "Not implemented" error) for every context type. That is exactly the
// "no WebGL" condition we want to exercise, so stub it quietly. Tests that need
// a specific getContext behaviour override it locally.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;

if (!("matchMedia" in window)) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
