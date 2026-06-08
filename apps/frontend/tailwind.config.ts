import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(214 32% 91%)",
        background: "hsl(210 40% 98%)",
        foreground: "hsl(222 47% 11%)",
        muted: "hsl(210 40% 96%)",
        primary: "hsl(173 80% 31%)",
        accent: "hsl(38 92% 50%)"
      }
    }
  },
  plugins: []
} satisfies Config;
