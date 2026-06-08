// Shared presentational primitives for the Tuji design. All pure (no hooks)
// so they're usable from server or client components.
import Mascot, { type MascotPose } from "./Mascot";

export const TUJI = {
  bg: "#FFFCF5",
  ink: "#0F1A1A",
  ink2: "#3F4F4F",
  ink3: "#7C8C8C",
  ink4: "#B5C2C2",
  teal: "#006F72",
  tealD: "#004A4C",
  tealS: "#D4ECEC",
  yellow: "#FFD24A",
  coral: "#FF6F4D",
  pink: "#FFCDD2",
  green: "#4FAE6F",
} as const;

// Darken/lighten a hex by pct (negative = darker). Used for the chunky
// pressable button's bottom shadow.
export function shade(hex: string, pct: number): string {
  if (!hex.startsWith("#")) return "rgba(0,0,0,.2)";
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  const f = pct / 100;
  r = Math.max(0, Math.min(255, Math.round(r + 255 * f)));
  g = Math.max(0, Math.min(255, Math.round(g + 255 * f)));
  b = Math.max(0, Math.min(255, Math.round(b + 255 * f)));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

// Map a 0-100 proficiency/mastery score to a tier label + colors.
export function scoreTier(score: number) {
  if (score >= 70)
    return { label: "穩", state: "已掌握", color: TUJI.green, badgeBg: "#E8F5EC", badgeFg: TUJI.green };
  if (score >= 40)
    return { label: "熟", state: "練習中", color: TUJI.teal, badgeBg: "#FFF4D6", badgeFg: "#9A6612" };
  return { label: "弱", state: "需加強", color: TUJI.coral, badgeBg: "#FBE6E1", badgeFg: TUJI.coral };
}

export function StreakChip({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-tuji-coral px-3 py-1.5 text-[13px] font-extrabold text-white">
      🔥 {n}
    </span>
  );
}

// SVG progress ring. label is rendered centered.
export function ProfRing({
  value,
  size = 56,
  stroke = 5,
  color = TUJI.teal,
  track = "#E8E8E8",
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  label?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
        />
      </svg>
      {label != null && (
        <div className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-tuji-ink">
          {label}
        </div>
      )}
    </div>
  );
}

// Picture tile for a word. Uses the real product photo; while/if it fails to
// load the tinted background + emoji stays visible underneath.
export function WordTile({
  imageUrl,
  word,
  emoji = "🐾",
  height = 130,
  rounded = 14,
  className,
  // `cover` (default) crops to fill — looks tidy in tile grids. `contain`
  // letterboxes against the gradient bg so the full photo is visible, which
  // is what the study flow needs (otherwise the key feature of the word
  // can be cropped out).
  fit = "cover",
}: {
  imageUrl?: string;
  word: string;
  emoji?: string;
  height?: number | string;
  rounded?: number;
  className?: string;
  fit?: "cover" | "contain";
}) {
  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height,
        borderRadius: rounded,
        overflow: "hidden",
        background: "linear-gradient(135deg, #EAF3F3, #F4ECDE)",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,.04)",
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-70 select-none">
        {emoji}
      </div>
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={word}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"}`}
        />
      )}
    </div>
  );
}

// Mascot + speech bubble.
export function MascotSay({
  pose = "wave",
  size = 56,
  children,
}: {
  pose?: MascotPose;
  size?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex shrink-0 items-end justify-center overflow-hidden rounded-full bg-tuji-tealS"
        style={{ width: size, height: size }}
      >
        <Mascot pose={pose} size={size * 0.95} />
      </div>
      <div className="relative rounded-2xl bg-white px-3.5 py-2 text-[13px] font-semibold text-tuji-ink shadow-soft">
        {children}
      </div>
    </div>
  );
}
