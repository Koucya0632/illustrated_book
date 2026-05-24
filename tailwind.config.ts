import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#FAF7F2",
        sky: {
          soft: "#E6F2FB",
          accent: "#7BB7E0",
        },
        mint: {
          soft: "#E6F4EC",
          accent: "#7BC9A0",
        },
        ink: "#2D3748",
        muted: "#6B7280",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "PingFang TC",
          "Noto Sans TC",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 4px 14px rgba(45,55,72,0.08)",
        soft: "0 2px 8px rgba(45,55,72,0.06)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
