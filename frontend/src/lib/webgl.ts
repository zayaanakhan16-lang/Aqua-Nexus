/**
 * WebGL availability probe.
 *
 * MapLibre GL requires a WebGL context. Several browser sessions cannot create
 * one — remote desktops, locked-down kiosks, hardware acceleration disabled, or
 * a software renderer with `GL_VENDOR = Disabled`. Detecting this up front lets
 * the map panel render an explicit fallback instead of throwing from the
 * MapLibre constructor.
 */

export interface WebGLSupport {
  supported: boolean;
  reason: string | null;
}

const SUPPORTED: WebGLSupport = { supported: true, reason: null };

const UNSUPPORTED = "WebGL is not available in this browser session.";

/**
 * Pure probe against a real canvas element. Kept free of module-level browser
 * access so it can be exercised directly in tests with an injected canvas.
 */
export function probeWebGL(canvas: HTMLCanvasElement): WebGLSupport {
  const contextTypes = ["webgl2", "webgl", "experimental-webgl"] as const;
  for (const type of contextTypes) {
    try {
      const context = canvas.getContext(type);
      if (context) {
        const gl = context as WebGLRenderingContext;
        // Some environments hand back a context whose vendor/renderer report
        // "Disabled", which cannot actually render. Treat that as unsupported
        // rather than letting MapLibre throw during initialisation.
        const vendor = gl.getParameter?.(gl.VENDOR);
        if (typeof vendor === "string" && vendor.toLowerCase() === "disabled") {
          return { supported: false, reason: UNSUPPORTED };
        }
        return SUPPORTED;
      }
    } catch {
      // A throwing getContext() is itself a definitive "no".
    }
  }
  return { supported: false, reason: UNSUPPORTED };
}

/**
 * Browser-safe wrapper. Returns unsupported (never throws) when there is no
 * document or canvas creation fails, e.g. during a non-DOM environment.
 */
export function detectWebGLSupport(): WebGLSupport {
  if (typeof document === "undefined") {
    return { supported: false, reason: UNSUPPORTED };
  }
  try {
    const canvas = document.createElement("canvas");
    return probeWebGL(canvas);
  } catch {
    return { supported: false, reason: UNSUPPORTED };
  }
}
