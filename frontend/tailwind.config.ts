import type { Config } from "tailwindcss";

/**
 * AquaNexus design tokens — premium blue water-intelligence identity.
 *
 * Palette anchors (documented in docs/DESIGN.md):
 *   Deep Ocean  #071D35   Ocean Blue  #1261A0
 *   Water Cyan  #45B6E8   Ice White   #EAF5FA   Soft Blue  #D5EAF5
 *
 * The token *names* are stable so components never change when the palette is
 * retuned; only these values move. `ink-500` is deliberately lighter than
 * `ink-400` (it is the small-muted-text colour and must clear WCAG AA on the
 * composited abyss surfaces), matching the convention established earlier.
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
          400: "#7f9fbc",
          // 500 is the small-muted-text colour; it must clear AA on the
          // composited abyss surfaces, so it is lighter than ink-400.
          500: "#97b6ce",
          600: "#3a5a78",
          700: "#27405a",
          800: "#16293d",
          900: "#0c1a29",
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
