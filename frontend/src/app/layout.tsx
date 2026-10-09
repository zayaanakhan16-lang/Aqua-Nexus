import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Space_Grotesk } from "next/font/google";

import "@/styles/globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AquaNexus — Global Water Intelligence",
  description:
    "Understand water. Detect risks. Find solutions. A global geospatial intelligence platform for investigating water conditions with transparent, evidence-based methods.",
  applicationName: "AquaNexus",
  authors: [{ name: "AquaNexus" }],
  keywords: ["water", "precipitation", "geospatial", "satellite", "drought", "intelligence"],
};

export const viewport: Viewport = {
  themeColor: "#061426",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
