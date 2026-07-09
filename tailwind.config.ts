import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        clinical: {
          navy: "#07111f",
          panel: "#101b2d",
          panelSoft: "#162338",
          line: "#26364f"
        }
      },
      boxShadow: {
        glass: "0 24px 80px rgba(0, 0, 0, 0.32)"
      }
    }
  },
  plugins: []
} satisfies Config;
