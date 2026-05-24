// Per-word mastery scoring + forgetting-curve decay.
//
// One score per (user, word) in user_words. A "word" has multiple cards
// (ZH→EN, EN→ZH, cloze) and mastery is shared across them so the UI can
// say "你對 fridge 的熟練度 = 65" rather than tracking 3 separate numbers.

import type { Rating } from "./srs";

// Raw performance score for each rating button.
// Higher = better. The EMA pulls mastery toward whichever score
// the user just earned.
const RATING_SCORE: Record<Rating, number> = {
  重來: 0,
  困難: 30,
  穩定: 70,
  熟練: 100,
};

// EMA weight on the new sample. Higher = more reactive to recent answers.
// 0.3 means a single answer moves the score ~30 % of the gap.
const EMA_ALPHA = 0.3;

// Forgetting-curve constant: tweaking this changes how fast knowledge
// fades. 5 means a 100-score word has a 20-day half-life; a 20-score
// word has 4 days.
const HALF_LIFE_DIVISOR = 5;
const MIN_HALF_LIFE_DAYS = 1;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Apply forgetting-curve decay between lastReviewedAt and now. */
export function applyDecay(
  mastery: number,
  lastReviewedAt: Date | null,
  now: Date = new Date(),
): number {
  if (!lastReviewedAt || mastery <= 0) return 0;
  const daysSince = (now.getTime() - lastReviewedAt.getTime()) / MS_PER_DAY;
  if (daysSince <= 0) return mastery;
  const halfLife = Math.max(MIN_HALF_LIFE_DAYS, mastery / HALF_LIFE_DIVISOR);
  // mastery_now = mastery × 2^(-days / halfLife)
  const factor = Math.pow(2, -daysSince / halfLife);
  return clamp(mastery * factor);
}

/**
 * Compute the new mastery after one answer.
 * Steps: decay → EMA blend with the answer score.
 */
export function applyAnswer(
  prevMastery: number,
  lastReviewedAt: Date | null,
  rating: Rating,
  now: Date = new Date(),
): { mastery: number; previousDecayed: number; delta: number } {
  const previousDecayed = applyDecay(prevMastery, lastReviewedAt, now);
  const score = RATING_SCORE[rating];
  const next = EMA_ALPHA * score + (1 - EMA_ALPHA) * previousDecayed;
  const mastery = clamp(next);
  return { mastery, previousDecayed, delta: mastery - previousDecayed };
}

function clamp(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

// ---- Display helpers ----

export interface MasteryLevel {
  key: "new" | "learning" | "practiced" | "mastered";
  label: string;
  zhLabel: string;
  color: string;
}

export function masteryLevel(score: number): MasteryLevel {
  if (score >= 80) {
    return { key: "mastered", label: "Mastered", zhLabel: "熟練", color: "emerald" };
  }
  if (score >= 50) {
    return { key: "practiced", label: "Practiced", zhLabel: "穩定", color: "sky" };
  }
  if (score >= 20) {
    return { key: "learning", label: "Learning", zhLabel: "學習中", color: "amber" };
  }
  return { key: "new", label: "New", zhLabel: "新接觸", color: "rose" };
}
