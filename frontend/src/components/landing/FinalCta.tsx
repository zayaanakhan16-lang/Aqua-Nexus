/**
 * Final call to action + footer.
 *
 * Reinforces the mission and provides the primary route into the workspace. The
 * footer links only to real project resources (repository, documentation) and
 * makes no invented partnership or certification claims.
 */
import Link from "next/link";
import { ArrowRight, BookOpen, Github } from "lucide-react";

import { BrandLockup } from "@/components/brand/Brand";

const FOOTER_LINKS = [
  {
    heading: "Platform",
    links: [
      { href: "#capabilities", label: "Capabilities" },
      { href: "#preview", label: "Product preview" },
      { href: "/atlas", label: "Open the Water Atlas" },
    ],
  },
  {
    heading: "Modules",
    links: [
      { href: "#water-stress", label: "Water Stress" },
      { href: "#flood", label: "Flood Intelligence" },
      { href: "#weather", label: "Weather & Rainfall" },
      { href: "#satellite", label: "Satellite Explorer" },
    ],
  },
  {
    heading: "Project",
    links: [
      {
        href: "https://github.com/zayaanakhan16-lang/Aqua-Nexus",
        label: "Source repository",
        external: true,
      },
      {
        href: "https://github.com/zayaanakhan16-lang/Aqua-Nexus/blob/main/docs/DATA_SOURCES.md",
        label: "Data sources",
        external: true,
      },
      {
        href: "https://github.com/zayaanakhan16-lang/Aqua-Nexus/blob/main/docs/SCIENCE.md",
        label: "Methods & limitations",
        external: true,
      },
    ],
  },
];

export function FinalCta() {
  return (
    <section className="relative overflow-hidden border-t border-white/[0.06] py-20 sm:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(760px_420px_at_50%_-10%,rgba(18,163,201,0.18),transparent_60%)]"
      />
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
          Start with a place. Follow the evidence.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-ink-300">
          Search any city, river or coordinate and open an evidence-backed view of its
          rainfall, water-balance signals and satellite coverage.
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            href="/atlas"
            className="group inline-flex items-center gap-2 rounded-lg bg-water-400 px-6 py-3 text-sm font-semibold text-abyss-950 shadow-float transition hover:bg-water-300"
          >
            Explore Water Intelligence
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-white/[0.06] bg-abyss-950/60">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-sm">
            <BrandLockup />
            <p className="mt-4 text-sm leading-relaxed text-ink-400">
              A global water-intelligence platform for investigating rainfall, modelled
              water balance and satellite coverage with transparent, evidence-based methods.
            </p>
            <p className="mt-4 text-[0.6875rem] text-ink-500">
              Not an official warning service. AquaNexus presents data and methods for
              investigation — it does not issue flood or drought warnings.
            </p>
          </div>

          {FOOTER_LINKS.map((group) => (
            <nav key={group.heading} aria-label={group.heading}>
              <p className="text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-ink-500">
                {group.heading}
              </p>
              <ul className="mt-3 space-y-2">
                {group.links.map((link) => (
                  <li key={link.href}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 text-sm text-ink-300 transition hover:text-ink-50"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="inline-flex items-center gap-1.5 text-sm text-ink-300 transition hover:text-ink-50"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-white/[0.06] pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-ink-500">
            © {new Date().getFullYear()} AquaNexus · Global water intelligence
          </p>
          <div className="flex items-center gap-4 text-xs text-ink-500">
            <a
              href="https://github.com/zayaanakhan16-lang/Aqua-Nexus"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 transition hover:text-ink-200"
            >
              <Github className="h-3.5 w-3.5" aria-hidden />
              Repository
            </a>
            <a
              href="https://github.com/zayaanakhan16-lang/Aqua-Nexus/blob/main/docs/ARCHITECTURE.md"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 transition hover:text-ink-200"
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden />
              Architecture
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
