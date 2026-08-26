// Which streak lengths are worth interrupting a session for, and whether this
// answer is the one that reached one.
//
// Kept pure and clear of the DB the way lib/atlas/enrich-policy.ts is kept
// clear of the AI SDK: the route handler, the query and the tests all have to
// ask this question, and none of them should have to stand up Postgres to ask
// it. Named for what it decides rather than for /api/study/answer.
//
// The client contract (Tuji/Core/Study/StudySessionWrites.swift) is one
// sentence and this module exists to keep it true:
//
//   > The server emits a streak milestone **only** on the answer that crosses
//   > the threshold.
//
// iOS keeps whichever milestone arrived during a session and promotes the
// completion screen to MilestoneView. If the server flagged every answer on
// day 30, a user who studies twice that day would be congratulated twice —
// and the screen's whole design rests on being rare
// (Tuji/Features/Study/MilestoneView.swift: "This screen appears three times a
// year at most; its weight comes from that rarity").

/// The three lengths that get a screen. Deliberately short: 30/100/365 is
/// about three interruptions a year, which is the budget MilestoneView was
/// designed against. Adding 7 here is a one-line change and roughly doubles
/// how often the screen appears — a product decision, not a tuning knob.
export const STREAK_MILESTONES: readonly number[] = [30, 100, 365];

export interface StreakMilestoneFacts {
  /// Study logs already recorded today, in the user's timezone and for the
  /// language being studied, **read before this answer is written**. Zero means
  /// this answer is the one that puts today on the board.
  todayLogCount: number;
  /// Length of the consecutive-day run ending *yesterday*, or 0 if yesterday
  /// had no study. This already encodes "was the streak alive" — a run that
  /// ended two days ago is not a run ending yesterday, so it reads 0 and today
  /// starts a fresh streak of 1.
  ///
  /// **Only meaningful when `todayLogCount` is 0.** Once today is on the board
  /// the run in the data ends today rather than yesterday, so this reads 0 for
  /// a user mid-streak — which is harmless only because `todayLogCount` is
  /// checked first. Read the two together or not at all.
  runEndingYesterday: number;
}

/// The streak this answer establishes, or `null` if it does not move the
/// streak (because today was already counted).
///
/// Note this is deliberately computed from *before* state. Reading after the
/// write would make the answer's own row indistinguishable from a second
/// device's, and two answers landing in the same millisecond would then each
/// see a count of 2 and **both** decline to celebrate — losing the milestone
/// with no way to recover it, since study_logs is append-only and the crossing
/// happens once. Computed from before-state, the same race produces two
/// identical milestones instead, which the client folds into one screen.
export function streakAfterAnswer(facts: StreakMilestoneFacts): number | null {
  if (facts.todayLogCount > 0) return null;
  return facts.runEndingYesterday + 1;
}

/// The milestone this answer crossed, or `null`. This is the whole rule.
export function crossedStreakMilestone(facts: StreakMilestoneFacts): number | null {
  const streak = streakAfterAnswer(facts);
  if (streak === null) return null;
  return STREAK_MILESTONES.includes(streak) ? streak : null;
}
