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
}

// Cap runaway intervals (~5 years).
const MAX_DAYS = 365 * 5;

export function schedule(state: CardState, rating: Rating, now = new Date()): ScheduleResult {
  const isNew = state.status === "新卡" || state.intervalDays <= 0;
  let intervalDays = state.intervalDays;
  let status: Status = state.status;

  if (rating === "重來") {
    intervalDays = TEN_MIN;
    status = "學習中";
  } else if (isNew) {
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
    if (rating === "困難") {
      intervalDays = Math.max(1, state.intervalDays * 1.3);
      status = state.intervalDays >= 21 ? "穩定" : "複習中";
    } else if (rating === "穩定") {
      intervalDays = state.intervalDays * 2.4;
      status = state.intervalDays >= 21 ? "穩定" : "複習中";
    } else if (rating === "熟練") {
      intervalDays = state.intervalDays * 3.8;
      status = intervalDays >= 21 ? "穩定" : "複習中";
    }
  }

  intervalDays = Math.min(intervalDays, MAX_DAYS);
  const nextReviewAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  return { status, intervalDays, nextReviewAt };
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
