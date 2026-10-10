import { cn } from "@/lib/utils";

/**
 * AquaNexus brand mark.
 *
 * A distinctive, self-contained SVG: a globe crosshair (meridian + parallel over
 * a sphere) nested inside a stylised droplet. It reads at 16px and scales to the
 * landing hero without raster assets or external requests.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label="AquaNexus"
      className={cn("h-8 w-8", className)}
    >
      <defs>
        <linearGradient id="aquanexus-brand-a" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9deafa" />
          <stop offset="0.5" stopColor="#2cc0e4" />
          <stop offset="1" stopColor="#0f8b74" />
        </linearGradient>
        <linearGradient id="aquanexus-brand-b" x1="16" y1="14" x2="34" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#eafcff" />
          <stop offset="1" stopColor="#63d8f3" />
        </linearGradient>
      </defs>

      {/* Droplet outline containing the globe. */}
      <path
        d="M24 3.5c6.4 6.9 12.2 13.2 12.2 21.4C36.2 34.7 30.7 41 24 41S11.8 34.7 11.8 24.9C11.8 16.7 17.6 10.4 24 3.5Z"
        fill="url(#aquanexus-brand-a)"
        fillOpacity="0.16"
        stroke="url(#aquanexus-brand-a)"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      {/* Sphere. */}
      <circle cx="24" cy="26" r="8.4" fill="none" stroke="url(#aquanexus-brand-b)" strokeWidth="1.7" />
      {/* Meridian + equator crosshair. */}
      <ellipse cx="24" cy="26" rx="3.7" ry="8.4" fill="none" stroke="url(#aquanexus-brand-b)" strokeWidth="1.2" strokeOpacity="0.85" />
      <path d="M15.8 26h16.4" stroke="url(#aquanexus-brand-b)" strokeWidth="1.2" strokeOpacity="0.85" />
      <circle cx="24" cy="26" r="1.9" fill="#eafcff" />
    </svg>
  );
}

/**
 * Brand mark plus wordmark. `tone` switches between the dark landing treatment
 * and the workspace treatment while keeping the same recognisable lockup.
 */
export function BrandLockup({
  className,
  subtitle = "Global water intelligence",
  markClassName,
  wordmarkClassName,
  subtitleClassName,
}: {
  className?: string;
  subtitle?: string | null;
  markClassName?: string;
  wordmarkClassName?: string;
  subtitleClassName?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark className={cn("h-8 w-8", markClassName)} />
      <span className="leading-tight">
        <span className={cn("block font-display text-sm font-semibold tracking-tight text-ink-50", wordmarkClassName)}>
          AquaNexus
        </span>
        {subtitle ? (
          <span className={cn("block text-[0.625rem] uppercase tracking-[0.16em] text-ink-500", subtitleClassName)}>
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}
