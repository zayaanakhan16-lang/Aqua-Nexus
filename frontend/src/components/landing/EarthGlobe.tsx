
"use client";

import { cn } from "@/lib/utils";

export const EARTH_TEXTURE_URL = "/earth-blue-marble-2048.jpg";

export function EarthGlobe({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Earth from NASA Blue Marble imagery, illuminated by a soft atmospheric glow"
      className={cn("relative isolate aspect-square", className)}
    >
      {/* Atmospheric halo */}
      <div
        aria-hidden="true"
        className="absolute inset-[4%] rounded-full bg-cyan-400/20 blur-3xl"
      />

      {/* Earth sphere */}
      <div
        aria-hidden="true"
        className="absolute inset-[7%] overflow-hidden rounded-full bg-[#07172b]"
        style={{
          boxShadow:
            "0 30px 90px -25px rgba(0,0,0,.85), 0 0 45px rgba(62,190,235,.18), inset -20px -8px 45px rgba(0,8,25,.5)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={EARTH_TEXTURE_URL}
          alt=""
          draggable={false}
          className="h-full w-full select-none rounded-full object-cover"
          style={{
            filter: "saturate(1.12) contrast(1.04) brightness(1.04)",
          }}
        />

        {/* Natural-looking light and night-side shading */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(ellipse at 28% 24%, rgba(255,255,255,.22), transparent 34%), radial-gradient(ellipse at 75% 78%, rgba(1,8,23,.72), transparent 59%), linear-gradient(115deg, transparent 45%, rgba(2,10,25,.38) 100%)",
            boxShadow:
              "inset 0 0 28px 7px rgba(1,9,24,.38), inset -8px -4px 24px rgba(1,7,20,.35)",
          }}
        />

        {/* Fine atmospheric rim */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full border border-cyan-100/15"
          style={{
            boxShadow: "inset 0 0 8px rgba(110,220,255,.18)",
          }}
        />
      </div>

      {/* Restrained orbital accents */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-[1%] rounded-full border border-cyan-200/[0.08]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-[0%] rounded-full"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, transparent 55%, rgba(30,155,205,.08) 70%, transparent 76%)",
        }}
      />
    </div>
  );
}
