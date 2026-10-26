import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  safelist: [{ pattern: /^(s|row|dot|tint)-(approved|conditional|redirected|needs_info|waiting|not_in_plan|not_eligible|withdrawn)$/ }],
  theme: {
    extend: {
      colors: {
        ink: "#111111",
        box: "#F3EFE6",
        surface: "#FFFDF8",
        orange: "#FF4B1F",
        lime: "#D4FF3A",
        cobalt: "#2B4BFF",
        line: "#D9D2C3",
        muted: "#5F5B52",
        danger: "#B3001B",
      },
      fontFamily: {
        display: ["var(--font-display)", "Impact", "sans-serif"],
        body: ["var(--font-body)", "var(--font-kn)", "var(--font-hi)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        hard: "4px 4px 0 #111111",
        hardlg: "6px 6px 0 #111111",
        orange: "4px 4px 0 #FF4B1F",
      },
    },
  },
  plugins: [],
};
export default config;
