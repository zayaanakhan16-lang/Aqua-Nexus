"use client";

/**
 * Public landing navigation.
 *
 * Reuses the shared brand lockup, links to the landing sections, and routes the
 * primary CTA to the real workspace at /atlas. The mobile menu is a real,
 * keyboard-operable disclosure; it does not auto-open or animate distractingly.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";

import { BrandLockup } from "@/components/brand/Brand";

const LINKS = [
  { href: "#capabilities", label: "Capabilities" },
  { href: "#water-stress", label: "Water Stress" },
  { href: "#flood", label: "Flood Intelligence" },
  { href: "#weather", label: "Weather & Rainfall" },
  { href: "#satellite", label: "Satellite" },
  { href: "#sources", label: "Data Sources" },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);

  // Close the mobile menu once the viewport is desktop-sized.
  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      if (window.innerWidth >= 1024) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-abyss-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="shrink-0" aria-label="AquaNexus home">
          {/* Placeholder mark: see Brand.tsx. Swap for the official asset when supplied. */}
          <BrandLockup subtitle={null} />
        </Link>

        <nav aria-label="Primary" className="ml-4 hidden items-center gap-0.5 lg:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm text-ink-300 transition hover:bg-white/[0.04] hover:text-ink-50"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/atlas"
            className="group hidden items-center gap-1.5 rounded-lg bg-water-400 px-3.5 py-2 text-sm font-semibold text-abyss-950 transition hover:bg-water-300 sm:inline-flex"
          >
            Explore Water Intelligence
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-ink-200 transition hover:text-ink-50 lg:hidden"
          >
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="landing-mobile-menu"
          aria-label="Primary mobile"
          className="border-t border-white/[0.06] bg-abyss-950/95 px-4 py-3 lg:hidden"
        >
          <ul className="grid gap-1">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-2.5 text-sm text-ink-200 transition hover:bg-white/[0.05] hover:text-ink-50"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <Link
            href="/atlas"
            onClick={() => setOpen(false)}
            className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-water-400 px-3.5 py-2.5 text-sm font-semibold text-abyss-950 transition hover:bg-water-300"
          >
            Explore Water Intelligence
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
