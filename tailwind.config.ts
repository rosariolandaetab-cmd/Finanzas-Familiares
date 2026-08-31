import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        gasto: "#ea580c",
        ingreso: "#2563eb",
        transferencia: "#6b7280",
        ink: "#4A3D2A",
        taupe: "#8A7A63",
        sand: "#E8DCC8",
        cream: "#FBF5EC",
        clay: "#B5602F",
        clayDark: "#94491F",
      },
      fontFamily: {
        sans: ["Outfit", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
