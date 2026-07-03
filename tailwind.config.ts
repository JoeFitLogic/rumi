import type { Config } from "tailwindcss";

/**
 * RUMI placeholder design system — white & gold.
 * Exact brand hexes pending from Niamh; swap the RGB triplets in
 * src/app/globals.css and everything here stays in sync.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "rgb(var(--paper) / <alpha-value>)",
        cream: "rgb(var(--cream) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-soft": "rgb(var(--ink-soft) / <alpha-value>)",
        gold: "rgb(var(--gold) / <alpha-value>)",
        "gold-deep": "rgb(var(--gold-deep) / <alpha-value>)",
        "gold-tint": "rgb(var(--gold-tint) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(25, 22, 19, 0.05), 0 4px 16px rgba(25, 22, 19, 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
