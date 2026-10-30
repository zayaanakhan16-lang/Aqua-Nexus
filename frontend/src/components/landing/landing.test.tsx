import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Hero } from "@/components/landing/Hero";
import { EarthGlobe } from "@/components/landing/EarthGlobe";
import { CapabilitiesSection } from "@/components/landing/CapabilitiesSection";
import { ProductPreview } from "@/components/landing/ProductPreview";
import { EvidenceSection } from "@/components/landing/EvidenceSection";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EarthGlobe", () => {
  it("shows a real NASA Earth image poster without requiring WebGL", () => {
    const { container } = render(<EarthGlobe />);
    expect(
      screen.getByRole("img", { name: /earth from nasa's blue marble/i }),
    ).toBeInTheDocument();
    // The static poster is a real image asset, not a drawn SVG globe.
    const poster = container.querySelector("img");
    expect(poster).not.toBeNull();
    expect(poster?.getAttribute("src")).toMatch(/earth-blue-marble/);
  });
});

describe("Hero", () => {
  it("renders the headline and routes the primary CTA into the app", () => {
    render(<Hero />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /water risks/i,
    );
    const cta = screen.getByRole("link", { name: /create study area/i });
    expect(cta).toHaveAttribute("href", "/explore");
  });

  it("attributes the hero Earth imagery to NASA Blue Marble", () => {
    render(<Hero />);
    expect(screen.getByText(/nasa blue marble/i)).toBeInTheDocument();
  });
});

describe("CapabilitiesSection", () => {
  it("lists every implemented module and marks them available", () => {
    render(<CapabilitiesSection />);
    const names = [
      "Water Stress Explorer",
      "Local Water Intelligence",
      "Flood Intelligence",
      "Weather & Rainfall",
      "Satellite Intelligence",
      "Future Outlook",
      "Global Intelligence",
      "AI Intelligence",
    ];
    for (const name of names) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByText("Available")).toHaveLength(names.length);
  });
});

describe("ProductPreview", () => {
  it("uses placeholder dashes rather than fabricated readings", () => {
    const { container } = render(<ProductPreview />);
    // The schematic explicitly declares it contains no readings.
    expect(screen.getByText(/no readings and no live/i)).toBeInTheDocument();
    // Indicator values are rendered as em-dash placeholders.
    expect(container.textContent).toContain("—");
  });
});

describe("EvidenceSection", () => {
  it("shows an honest unavailable state when the catalogue cannot load", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    render(<EvidenceSection />);
    await waitFor(() =>
      expect(screen.getByText(/provider catalogue unavailable/i)).toBeInTheDocument(),
    );
  });

  it("lists real providers from the API rather than a hardcoded list", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/health")) {
        return new Response(
          JSON.stringify({
            status: "ok",
            service: "aquanexus-api",
            version: "0.1.0",
            environment: "test",
            time_utc: "2026-01-01T00:00:00Z",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          count: 1,
          classifications: ["reanalysis"],
          providers: [
            {
              id: "open_meteo_archive",
              name: "Open-Meteo Historical Weather API",
              product: "ERA5 / ERA5-Land reanalysis",
              url: "https://open-meteo.com/en/docs/historical-weather-api",
              attribution: "Contains modified Copernicus Climate Change Service information (ERA5)",
              classification: "reanalysis",
              spatial_resolution: "~9 km",
              units: "mm",
              limitations: [],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    render(<EvidenceSection />);
    await waitFor(() =>
      expect(screen.getByText("Open-Meteo Historical Weather API")).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: /^documentation$/i })).toHaveAttribute(
      "href",
      "https://open-meteo.com/en/docs/historical-weather-api",
    );
  });
});
