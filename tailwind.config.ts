import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#faf9f6",
        ink: "#211f1b",
        "ink-soft": "#6b6860",
        "ink-faint": "#9c988c",
        rule: "#e4e1d8",
        accent: "#7a6a52",
        "accent-soft": "#efe9de",
        brick: "#a8503d",
        moss: "#5b6e4f",
      },
    },
  },
  plugins: [],
};

export default config;
