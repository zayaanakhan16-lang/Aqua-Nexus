"use client";

/**
 * Hero Earth visual.
 *
 * A real photographic Earth — NASA's Blue Marble (topography + bathymetry,
 * December 2004) — rendered as a slowly rotating sphere. This is a pure CSS
 * build: no WebGL, no canvas and no 3D dependency, so it works in every
 * browser session and cannot fail a production build. The texture is
 * self-hosted under `public/` (no hotlinked remote asset) and attributed on
 * the landing page.
 *
 * Rotation uses the shared `drift` keyframe. `motion-reduce:animate-none`
 * (applied by the caller) stops it for users who prefer reduced motion, which
 * also keeps the page cheap on low-power devices.
 */
import { cn } from "@/lib/utils";

/** NASA Blue Marble (NASA imagery, generally not subject to copyright in the
 * US; self-hosted for reliability and attributed on the landing page). */
export const EARTH_TEXTURE_URL = "/earth-blue-marble-2048.jpg";

export function EarthGlobe({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Rotating view of Earth from NASA's Blue Marble imagery"
      className={cn("relative aspect-square", className)}
    >
      {/* The sphere: the real Earth image, lit from the upper right. */}
      <div
        aria-hidden
        className="absolute inset-0 overflow-hidden rounded-full bg-[#0a1a2f] shadow-[0_40px_120px_-30px_rgba(3,9,20,0.9)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={EARTH_TEXTURE_URL}
          alt=""
          draggable={false}
          className="h-full w-full select-none rounded-full object-cover animate-drift motion-reduce:animate-none"
          style={{ filter: "saturate(1.05) brightness(1.02)" }}
        />
        {/* Directional shading so the sphere reads as three-dimensional, and a
            dark limb that hides the texture seam at the rotation edge. */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 42%), radial-gradient(circle at 72% 76%, rgba(2,8,20,0.75) 0%, rgba(2,8,20,0) 55%)",
            boxShadow: "inset 0 0 70px 18px rgba(3,10,24,0.85)",
          }}
        />
      </div>

      {/* Atmospheric halo behind the sphere. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          boxShadow:
            "0 0 90px 12px rgba(44,160,220,0.22), inset 0 0 80px 10px rgba(10,60,110,0.35)",
        }}
      />
    </div>
  );
}
