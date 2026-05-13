import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sun: {
          50: "#fff8e8",
          100: "#ffefc5",
          200: "#ffe29a",
          300: "#ffd166",
          400: "#ffbe33",
          500: "#ffad0a",
          600: "#f59f00",
          700: "#cc7f00",
          800: "#a66400",
          900: "#804d00"
        },
        water: {
          50: "#ecfeff",
          100: "#cffafe",
          200: "#a5f3fc",
          300: "#67e8f9",
          400: "#22d3ee",
          500: "#06b6d4",
          600: "#0891b2",
          700: "#0e7490",
          800: "#155e75",
          900: "#164e63"
        }
      },
      backgroundImage: {
        "sun-water":
          "radial-gradient(1200px circle at 10% 10%, rgba(255, 209, 102, 0.35), rgba(255,255,255,0) 45%), radial-gradient(900px circle at 85% 25%, rgba(34, 211, 238, 0.30), rgba(255,255,255,0) 50%), linear-gradient(135deg, #ECFEFF 0%, #FFF8E8 55%, #E0FBFF 100%)"
      }
    }
  },
  plugins: []
} satisfies Config;

