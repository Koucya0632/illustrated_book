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

        // ── Tuji · 紙與墨 (Paper & Ink) ──
        // Ported from tuji-ios Tuji/Core/Theme/TujiColor.swift, which is the
        // source of truth — NOT docs/Tuji-redesign/B-Token定義.md, which still
        // assigns 積累 to teal. The app shipped mist blue for 積累 and added a
        // cocoa supporting ground; both differ from that doc.
        //
        // Six meanings, and every colour belongs to one of them:
        //   paper — the ground. Three steps, expressing region hierarchy.
        //   ink   — text, and dark blocks. Depth is a change of ground, never a shadow.
        //   brand — identity. Yellow is primary, cocoa the supporting ground.
        //   current — where the next step is. Yellow, and *only* for that.
        //   accum — mastery / completion / streak. Never a button or a heading.
        //   alert — errors and destructive actions.
        tuji: {
          // 紙 — carries every "region" signal.
          paper: "#FBF7EF", // app background, the default ground
          paper2: "#F2ECE0", // pressed, input, skeleton, image container
          paper3: "#E5DCCB", // disabled ground, progress track

          // 墨 — text and the only depth layer.
          ink: "#191512", // primary text AND dark-block ground (one role)
          ink2: "#4A4239", // secondary text
          ink3: "#8A8073", // tertiary text, captions, placeholders
          rule: "#D9D0C0", // the only line. 1px separators.

          // 品牌 / 現在 — same value, two meanings, so either can evolve.
          brand: "#F5C84B", // identity, taken from the mascot's eyes
          brandPressed: "#C79A1E",
          cocoa: "#59483D", // warm supporting ground, shared with the app icon
          current: "#F5C84B", // primary action, progress fill, focus, check
          currentDeep: "#C79A1E",

          // 積累 — learned value. A screen with none means nothing learned yet.
          accum: "#5A718A",
          accumDeep: "#40566D",
          accumSoft: "#DDE5EC",

          alert: "#D8452B",

          // ── Pre-redesign palette ──
          // Still referenced by the logged-in app pages (今天 / 圖鑑 / 學習 /
          // 我 / 設定 / admin), which have not been converted yet. Values are
          // frozen so those screens keep rendering coherently; nothing new
          // should reach for them. `bg`/`ink*` are deliberately absent here —
          // they were repointed above (cream→paper, teal-black→warm ink), a
          // change small enough to carry the old screens with it.
          card: "#FFFFFF",
          ink4: "#B5C2C2",
          teal: "#006F72",
          tealD: "#004A4C",
          tealS: "#D4ECEC",
          yellow: "#FFD24A",
          coral: "#FF6F4D",
          pink: "#FFCDD2",
          green: "#4FAE6F",
          bg: "#FBF7EF", // repointed to paper; kept as an alias for app pages
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
      // 紙與墨 has no shadow at all: depth is a change of ground (paper →
      // paper2 → paper3 → ink). These remain only for the unconverted app
      // pages — the marketing surface must not use them.
      boxShadow: {
        card: "0 8px 24px rgba(15,26,26,0.08)",
        cardHover: "0 14px 36px rgba(15,26,26,0.14)",
        soft: "0 2px 8px rgba(15,26,26,0.06)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      // bw3: the selection indicator — tab top edge, sheet top edge, status
      // label leading edge. Tailwind ships 0/2/4/8, so 3 has to be added.
      borderWidth: {
        3: "3px",
      },
      // Three durations, one curve (easeOut). d3 is the only animation allowed
      // to be *seen*: progress counting up, mastery climbing, skeleton breathing.
      transitionDuration: {
        120: "120ms",
        220: "220ms",
        400: "400ms",
      },
    },
  },
  plugins: [],
};

export default config;
