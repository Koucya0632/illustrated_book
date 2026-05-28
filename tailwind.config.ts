import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Legacy palette (still used by not-yet-converted pages) ──
        cream: "#FFFCF5",
        sky: {
          soft: "#E6F2FB",
          accent: "#7BB7E0",
        },
        mint: {
          soft: "#E6F4EC",
          accent: "#7BC9A0",
        },
        ink: "#0F1A1A",
        muted: "#6B7280",

        // ── Tuji · "Direction B" design system ──
        tuji: {
          bg: "#FFFCF5", // cream page background
          card: "#FFFFFF",
          ink: "#0F1A1A", // deep teal-black — headings / dark surfaces
          ink2: "#3F4F4F", // body
          ink3: "#7C8C8C", // secondary / muted
          ink4: "#B5C2C2", // tertiary / placeholder
          teal: "#006F72", // primary
          tealD: "#004A4C",
          tealS: "#D4ECEC", // soft teal surface
          yellow: "#FFD24A",
          coral: "#FF6F4D",
          pink: "#FFCDD2",
          green: "#4FAE6F",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-jakarta)",
          "var(--font-noto-tc)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "PingFang TC",
          "Noto Sans TC",
          "sans-serif",
        ],
        display: [
          "var(--font-jakarta)",
          "var(--font-noto-tc)",
          "ui-sans-serif",
          "sans-serif",
        ],
        mono: ["var(--font-jetbrains)", "ui-monospace", "SF Mono", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 8px 24px rgba(15,26,26,0.08)",
        cardHover: "0 14px 36px rgba(15,26,26,0.14)",
        soft: "0 2px 8px rgba(15,26,26,0.06)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
