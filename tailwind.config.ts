import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        gasto: "#ea580c",
        ingreso: "#2563eb",
        transferencia: "#6b7280",
      },
    },
  },
  plugins: [],
};

export default config;
