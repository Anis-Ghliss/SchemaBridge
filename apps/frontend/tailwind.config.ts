import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(0 0% 90%)",
        background: "hsl(0 0% 99%)",
        foreground: "hsl(0 0% 9%)",
        muted: "hsl(0 0% 96%)",
        primary: "hsl(0 0% 9%)",
        "primary-foreground": "hsl(0 0% 100%)",
        accent: "hsl(0 0% 30%)"
      }
    }
  },
  plugins: []
} satisfies Config;
