/**
 * Public landing page (/).
 *
 * Composes the cinematic introduction to AquaNexus. It is a server component
 * that pulls in a small number of client islands (navigation, scroll-reveal,
 * live provider/health status) — the page itself needs no WebGL and stays fully
 * usable when the browser cannot create a graphics context.
 */
import { Hero } from "@/components/landing/Hero";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { CapabilitiesSection } from "@/components/landing/CapabilitiesSection";
import { ProductPreview } from "@/components/landing/ProductPreview";
import { EvidenceSection } from "@/components/landing/EvidenceSection";
import { FinalCta, LandingFooter } from "@/components/landing/FinalCta";
import { LandingNav } from "@/components/landing/LandingNav";

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-abyss-950">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-water-400 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-abyss-950"
      >
        Skip to content
      </a>
      <LandingNav />
      <main id="main">
        <Hero />
        <ProblemSection />
        <CapabilitiesSection />
        <ProductPreview />
        <EvidenceSection />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
