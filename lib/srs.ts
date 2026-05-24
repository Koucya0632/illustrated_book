// Spaced-repetition scheduler implementing the rules from the spec.
//
// Ratings: 重來 / 困難 / 穩定 / 熟練
// Statuses: 新卡 / 學習中 / 複習中 / 穩定

export type Rating = "重來" | "困難" | "穩定" | "熟練";
export type Status = "新卡" | "學習中" | "複習中" | "穩定";

const MIN = 1 / 1440; // 1 minute in days
const TEN_MIN = 10 * MIN;

export interface CardState {
  status: Status;
  intervalDays: number; // current interval (fractional days)
}

export interface ScheduleResult {
  status: Status;
  intervalDays: number;
  nextReviewAt: Date;
  appliedPenalty?: number; // <1 means the interval was shortened
}

export interface MistakeStats {
  reviewCount: number;
  mistakeCount: number;
}

// Cap runaway intervals (~5 years).
const MAX_DAYS = 365 * 5;

// Compute a multiplier in [0.5, 1.0] that shortens the next interval when the
// card has historically been wrong a lot. Uses the lifetime ratio:
//   penalty = max(0.5, 1 − rate × 0.5)
// rate=0   → 1.00   (no change)
// rate=0.5 → 0.75
// rate=1.0 → 0.50   (floor: never less than half the base multiplier)
//
// Floor is intentional — even a card you've failed 10/10 should eventually
// move forward when you do get it, just slower.
export function mistakePenalty(stats?: MistakeStats): number {
  if (!stats || stats.reviewCount <= 0 || stats.mistakeCount <= 0) return 1;
  const rate = Math.min(1, stats.mistakeCount / stats.reviewCount);
  return Math.max(0.5, 1 - rate * 0.5);
}

export function schedule(
  state: CardState,
  rating: Rating,
  stats?: MistakeStats,
  now = new Date(),
): ScheduleResult {
  const isNew = state.status === "新卡" || state.intervalDays <= 0;
  let intervalDays = state.intervalDays;
  let status: Status = state.status;
  let appliedPenalty = 1;

  if (rating === "重來") {
    intervalDays = TEN_MIN;
    status = "學習中";
  } else if (isNew) {
    // New cards: fixed step intervals, no penalty.
    if (rating === "困難") {
      intervalDays = 1;
      status = "學習中";
    } else if (rating === "穩定") {
      intervalDays = 3;
      status = "複習中";
    } else if (rating === "熟練") {
      intervalDays = 7;
      status = "複習中";
    }
  } else {
    // Multiplier-driven growth; cards with high mistake rate grow slower.
    appliedPenalty = mistakePenalty(stats);
    if (rating === "困難") {
      intervalDays = Math.max(1, state.intervalDays * 1.3 * appliedPenalty);
      status = state.intervalDays >= 21 ? "穩定" : "複習中";
    } else if (rating === "穩定") {
      intervalDays = state.intervalDays * 2.4 * appliedPenalty;
      status = state.intervalDays >= 21 ? "穩定" : "複習中";
    } else if (rating === "熟練") {
      intervalDays = state.intervalDays * 3.8 * appliedPenalty;
      status = intervalDays >= 21 ? "穩定" : "複習中";
    }
  }

  intervalDays = Math.min(intervalDays, MAX_DAYS);
  const nextReviewAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  return { status, intervalDays, nextReviewAt, appliedPenalty };
}

// Human-friendly formatting for "next review in ...".
export function humanizeInterval(days: number): string {
  if (days < 1) {
    const mins = Math.round(days * 24 * 60);
    if (mins < 60) return `${mins} 分鐘後`;
    const hours = Math.round(mins / 60);
    return `${hours} 小時後`;
  }
  if (days < 7) {
    return `${Math.round(days)} 天後`;
  }
  if (days < 30) {
    return `約 ${Math.round(days / 7)} 週後`;
  }
  if (days < 365) {
    return `約 ${Math.round(days / 30)} 個月後`;
  }
  return `約 ${(days / 365).toFixed(1)} 年後`;
}

export function humanizeWhen(date: Date): string {
  const now = Date.now();
  const diffDays = (date.getTime() - now) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "已到期";
  return humanizeInterval(diffDays);
}
