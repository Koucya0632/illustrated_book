import { masteryLevel } from "@/lib/mastery";

// Server-renderable. No client state.
export default function MasteryBar({
  score,
  size = "md",
  showLabel = true,
}: {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const level = masteryLevel(s);
  const color = COLOR[level.color] ?? COLOR.rose;
  const heights = { sm: "h-1.5", md: "h-2.5", lg: "h-3" };

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted">熟練度</span>
          <span className="font-medium text-ink">
            {s} <span className="text-muted">/ 100 · {level.zhLabel}</span>
          </span>
        </div>
      )}
      <div className={`mt-1 ${heights[size]} bg-cream rounded-full overflow-hidden`}>
        <div className={`h-full ${color} transition-all`} style={{ width: `${s}%` }} />
      </div>
    </div>
  );
}

const COLOR: Record<string, string> = {
  emerald: "bg-emerald-500",
  sky: "bg-sky-accent",
  amber: "bg-amber-500",
  rose: "bg-rose-400",
};
