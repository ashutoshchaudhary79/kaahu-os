import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#f7f4ed",
        surface: "#fffdf9",
        ink: "#211f1b",
        "ink-soft": "#6d6a63",
        "ink-faint": "#77736b",
        rule: "#ddd8ce",
        accent: "#315747",
        "accent-soft": "#e6ece8",
        brick: "#b84a3c",
        moss: "#278060",
        orange: "#c4663d",
        amber: "#c68a2b",
        analytics: "#4e7190",
      },
    },
  },
  plugins: [],
};

export default config;
