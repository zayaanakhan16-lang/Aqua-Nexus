/**
 * Illustrative Earth visual for the landing hero.
 *
 * A self-contained SVG hemisphere — ocean gradient, fine graticule, stylised
 * (non-geographic) landmasses, atmosphere rim and a slow drifting highlight.
 * It is explicitly decorative: it renders no real coordinates or environmental
 * values, requires no WebGL, and is announced as "Illustrative" in the UI. The
 * slow rotation stops under `prefers-reduced-motion`.
 */
export function GlobeVisual({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 640 640"
      className={className}
      role="img"
      aria-label="Illustrative view of Earth as a globe"
    >
      <defs>
        <radialGradient id="gv-ocean" cx="38%" cy="32%" r="78%">
          <stop offset="0%" stopColor="#1d5f86" />
          <stop offset="42%" stopColor="#12405f" />
          <stop offset="100%" stopColor="#061426" />
        </radialGradient>
        <radialGradient id="gv-spec" cx="34%" cy="28%" r="42%">
          <stop offset="0%" stopColor="#eafcff" stopOpacity="0.5" />
          <stop offset="60%" stopColor="#9deafa" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#9deafa" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="gv-shadow" cx="72%" cy="76%" r="70%">
          <stop offset="0%" stopColor="#02070f" stopOpacity="0.72" />
          <stop offset="65%" stopColor="#02070f" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#02070f" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="gv-atmo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#63d8f3" stopOpacity="0.75" />
          <stop offset="55%" stopColor="#2cc0e4" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#16b092" stopOpacity="0.28" />
        </linearGradient>
        <linearGradient id="gv-land" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2f9c86" />
          <stop offset="100%" stopColor="#1c6f6a" />
        </linearGradient>
        <clipPath id="gv-clip">
          <circle cx="320" cy="320" r="250" />
        </clipPath>
      </defs>

      {/* Atmosphere rim. */}
      <circle cx="320" cy="320" r="262" fill="none" stroke="url(#gv-atmo)" strokeWidth="14" strokeOpacity="0.5" />
      <circle cx="320" cy="320" r="252" fill="none" stroke="#63d8f3" strokeOpacity="0.25" strokeWidth="1" />

      {/* Sphere. */}
      <circle cx="320" cy="320" r="250" fill="url(#gv-ocean)" />

      <g clipPath="url(#gv-clip)">
        {/* Fine graticule. */}
        <g stroke="#9deafa" strokeOpacity="0.14" strokeWidth="0.8" fill="none">
          {Array.from({ length: 13 }, (_, i) => 40 + i * 42).map((x) => (
            <line key={`v${x}`} x1={x} y1="70" x2={x} y2="570" />
          ))}
          {Array.from({ length: 13 }, (_, i) => 40 + i * 42).map((y) => (
            <line key={`h${y}`} x1="70" y1={y} x2="570" y2={y} />
          ))}
          <ellipse cx="320" cy="320" rx="250" ry="120" />
          <ellipse cx="320" cy="320" rx="250" ry="190" />
          <ellipse cx="320" cy="320" rx="120" ry="250" />
          <ellipse cx="320" cy="320" rx="190" ry="250" />
        </g>

        {/* Stylised, non-geographic landmasses (illustrative only). */}
        <g fill="url(#gv-land)" fillOpacity="0.85">
          <path d="M150 190c28-22 66-14 84 12s4 54-16 72-34 44-42 70-30 26-42 2-14-58-6-88 22-46 22-68Z" />
          <path d="M262 300c22-30 56-26 72 2s10 62-8 92-24 58-18 86-18 34-34 12-16-62-10-96 6-66-2-96Z" />
          <path d="M360 150c40-18 92-6 116 26s20 74-6 100-54 40-80 30-40-34-46-66-8-58 16-90Z" />
          <path d="M452 348c30-8 58 8 62 34s-16 46-40 48-44-14-44-40 10-38 22-42Z" />
          <path d="M300 132c18-10 40-4 46 12s-8 32-26 34-34-8-34-24 6-18 14-22Z" />
        </g>

        {/* Selected-point hint (decorative). */}
        <g>
          <circle cx="300" cy="330" r="34" fill="none" stroke="#a6f2e2" strokeOpacity="0.5" strokeWidth="1.2" />
          <circle cx="300" cy="330" r="5" fill="#eafcff" />
        </g>

        <circle cx="320" cy="320" r="250" fill="url(#gv-shadow)" />
        <circle cx="320" cy="320" r="250" fill="url(#gv-spec)" />
      </g>

      {/* Slow drifting highlight; freezes under reduced motion. */}
      <circle
        cx="320"
        cy="320"
        r="250"
        fill="none"
        stroke="#eafcff"
        strokeOpacity="0.12"
        strokeWidth="2"
        strokeDasharray="6 22"
        className="origin-center animate-drift motion-reduce:animate-none"
      />
    </svg>
  );
}
