import type { Config } from "tailwindcss";

/**
 * AquaNexus design tokens.
 *
 * A deep ocean/navy foundation with water-cyan and restrained teal accents.
 * These tokens are the single source of visual truth so a later design pass can
 * retune the palette without touching components.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        abyss: {
          950: "#030914",
          900: "#061426",
          850: "#08192e",
          800: "#0b2038",
          700: "#102b47",
          600: "#173a5c",
        },
        water: {
          50: "#eafcff",
          100: "#cbf5fd",
          200: "#9deafa",
          300: "#63d8f3",
          400: "#2cc0e4",
          500: "#12a3c9",
          600: "#0c82a6",
          700: "#0e6885",
          800: "#12556c",
          900: "#14475c",
        },
        teal: {
          400: "#39d3b4",
          500: "#16b092",
          600: "#0f8b74",
        },
        ink: {
          50: "#f4f7fa",
          100: "#e3eaf1",
          200: "#c7d3e0",
          300: "#9fb0c4",
          400: "#6f8399",
          // 500 raised from #4c5f74 so small muted text meets WCAG AA (~5.6:1)
          // on the abyss palette instead of the previous ~2.8:1.
          500: "#7d90a6",
          600: "#35465a",
          700: "#233246",
          800: "#162233",
          900: "#0d1622",
        },
        // Semantic states used across panels and badges.
        signal: {
          good: "#39d3b4",
          caution: "#e5b454",
          alert: "#e4795b",
          info: "#63d8f3",
          muted: "#6f8399",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 12px 32px -18px rgba(0,0,0,0.9)",
        float: "0 18px 48px -24px rgba(0,0,0,0.95)",
        focus: "0 0 0 2px rgba(99,216,243,0.6)",
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
      },
      animation: {
        "fade-in": "fade-in 220ms ease-out both",
        shimmer: "shimmer 1.6s linear infinite",
        "pulse-ring": "pulse-ring 2.2s ease-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
