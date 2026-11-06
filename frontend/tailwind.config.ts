import type { Config } from "tailwindcss";

/**
 * AquaNexus design tokens — the AgriSense interface language, recoloured blue.
 *
 * The token *names* are stable so components never change when the palette is
 * retuned; only these values move. The scale, density and surface treatments
 * follow the AgriSense reference (compact SaaS chrome, 1px borders, restrained
 * accent), while the hues stay AquaNexus water-blue:
 *
 *   abyss-950  deep ocean / near-black background
 *   abyss-900  sidebar and panel surface
 *   ink-100    ice white primary text
 *   water-300  restrained water-cyan accent
 *   boundary   warm amber/gold stroke for drawn areas (stays legible on blue)
 *   viz.*      colour-blind-considerate categorical data-visualisation set
 *
 * `ink-500` is deliberately lighter than `ink-400`: it is the small-muted-text
 * colour and must clear WCAG AA on the composited abyss surfaces. Contrast is
 * verified from rendered pixels, not inferred from these values.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        abyss: {
          950: "#04101f",
          900: "#071d35",
          850: "#0a2542",
          800: "#0d2c4d",
          700: "#123a63",
          600: "#17497a",
        },
        water: {
          50: "#eaf5fa",
          100: "#d5eaf5",
          200: "#b3daf0",
          300: "#45b6e8",
          400: "#2f9fd8",
          500: "#1261a0",
          600: "#0f5490",
          700: "#0d4778",
          800: "#0b3a63",
          900: "#0a2f50",
        },
        teal: {
          400: "#38d0a6",
          500: "#14a883",
          600: "#0d8a6b",
        },
        ink: {
          50: "#f2f8fc",
          100: "#eaf5fa",
          200: "#cfe4f2",
          300: "#a9c9e0",
          // 400 is the default muted text/placeholder tone. It is set so it
          // still clears AA on the lightest composited surface it lands on
          // (floating chrome over satellite imagery), not just on the panels.
          400: "#88a8c4",
          // 500 is the small-muted-text colour; it must clear AA on the
          // composited abyss surfaces, so it is lighter than ink-400.
          500: "#97b6ce",
          600: "#3a5a78",
          700: "#27405a",
          800: "#16293d",
          900: "#0c1a29",
        },
        /**
         * Warm amber/gold used only for drawn-area boundaries and their
         * handles. Deliberately outside the blue ramp: an area the user drew
         * must never be mistaken for the cyan accent or for provider imagery.
         */
        boundary: {
          DEFAULT: "#e3b341",
          soft: "#f2d27a",
          deep: "#8a6420",
        },
        /** Categorical chart colours that stay distinguishable on blue. */
        viz: {
          1: "#45b6e8",
          2: "#f2b134",
          3: "#4fd1a5",
          4: "#f2708a",
          5: "#a78bfa",
          6: "#f2e14c",
          7: "#7fb6e0",
          8: "#e4795b",
        },
        // Semantic states used across panels and badges.
        signal: {
          good: "#38d0a6",
          caution: "#e9b955",
          alert: "#ec7a5c",
          info: "#45b6e8",
          muted: "#7f9fbc",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        // AgriSense's compact label sizes.
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.03em" }],
        "3xs": ["0.625rem", { lineHeight: "0.875rem", letterSpacing: "0.06em" }],
      },
      boxShadow: {
        panel: "0 1px 2px rgba(2, 10, 22, 0.35), 0 12px 30px -16px rgba(0, 0, 0, 0.85)",
        float: "0 2px 8px rgba(2, 10, 22, 0.4), 0 26px 60px -22px rgba(0, 0, 0, 0.9)",
        inset: "inset 0 1px 0 rgba(255, 255, 255, 0.05)",
        focus: "0 0 0 2px rgba(69, 182, 232, 0.6)",
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.8)", opacity: "0.7" },
          "100%": { transform: "scale(2.2)", opacity: "0" },
        },
        drift: {
          "0%": { transform: "translate3d(0, 0, 0) rotate(0deg)" },
          "100%": { transform: "translate3d(0, 0, 0) rotate(360deg)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        aurora: {
          "0%, 100%": { opacity: "0.45", transform: "translate3d(0,0,0) scale(1)" },
          "50%": { opacity: "0.75", transform: "translate3d(0,-2%,0) scale(1.06)" },
        },
        sheen: {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
      },
      animation: {
        "fade-in": "fade-in 220ms ease-out both",
        shimmer: "shimmer 1.6s linear infinite",
        "pulse-ring": "pulse-ring 2.2s ease-out infinite",
        drift: "drift 120s linear infinite",
        "float-slow": "float-slow 9s ease-in-out infinite",
        aurora: "aurora 14s ease-in-out infinite",
        sheen: "sheen 6s ease-in-out infinite alternate",
      },
    },
  },
  plugins: [],
};

export default config;
