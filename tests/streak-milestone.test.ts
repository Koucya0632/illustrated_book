// Pins the rule in lib/streak-milestone.ts.
//
// THE RED LINE: exactly one milestone per crossing. iOS keeps whichever
// milestone arrives during a session and promotes the completion screen to
// MilestoneView, so a server that flags every answer on day 30 congratulates a
// user once per session all day — and MilestoneView's design is explicitly
// built on being rare ("This screen appears three times a year at most; its
// weight comes from that rarity"). The "already studied today" guard is the
// only thing standing between the two, which is why most of these tests are
// about it rather than about the thresholds.
//
// The mirror failure matters just as much: study_logs is append-only and a
// crossing happens once, so a milestone that is *not* emitted is gone for good.
// That asymmetry is why the rule reads before-state — see the note on
// streakAfterAnswer.

import assert from "node:assert/strict";
import test from "node:test";
import {
  STREAK_MILESTONES,
  crossedStreakMilestone,
  streakAfterAnswer,
} from "../lib/streak-milestone";

test("the first answer of the day on day 30 crosses", () => {
  assert.equal(
    crossedStreakMilestone({ todayLogCount: 0, runEndingYesterday: 29 }),
    30,
  );
});

test("every later answer that same day is silent", () => {
  // The one that would double-congratulate. runEndingYesterday still reads 29
  // because yesterday has not changed — only todayLogCount separates this
  // answer from the one above.
  for (const todayLogCount of [1, 2, 17]) {
    assert.equal(
      crossedStreakMilestone({ todayLogCount, runEndingYesterday: 29 }),
      null,
    );
  }
});

test("100 and 365 cross the same way", () => {
  assert.equal(crossedStreakMilestone({ todayLogCount: 0, runEndingYesterday: 99 }), 100);
  assert.equal(crossedStreakMilestone({ todayLogCount: 0, runEndingYesterday: 364 }), 365);
});

test("the days on either side of a threshold are silent", () => {
  assert.equal(crossedStreakMilestone({ todayLogCount: 0, runEndingYesterday: 28 }), null);
  assert.equal(crossedStreakMilestone({ todayLogCount: 0, runEndingYesterday: 30 }), null);
});

test("a broken streak restarts at 1 rather than resuming", () => {
  // runEndingYesterday is 0 whenever yesterday had no study, however long the
  // run before it was. Day 1 is not a milestone, so nothing fires.
  assert.equal(streakAfterAnswer({ todayLogCount: 0, runEndingYesterday: 0 }), 1);
  assert.equal(crossedStreakMilestone({ todayLogCount: 0, runEndingYesterday: 0 }), null);
});

test("a user who broke a 200-day streak must earn day 30 again", () => {
  // The dangerous shape: 29 days back into a rebuild, the old run is
  // irrelevant because it did not end yesterday.
  assert.equal(crossedStreakMilestone({ todayLogCount: 0, runEndingYesterday: 29 }), 30);
});

test("streakAfterAnswer says nothing when today is already counted", () => {
  // Distinct from "the streak is 30" — this answer does not move it at all.
  assert.equal(streakAfterAnswer({ todayLogCount: 1, runEndingYesterday: 29 }), null);
});

test("a brand-new user's first ever answer is streak 1 and no milestone", () => {
  assert.equal(streakAfterAnswer({ todayLogCount: 0, runEndingYesterday: 0 }), 1);
  assert.equal(crossedStreakMilestone({ todayLogCount: 0, runEndingYesterday: 0 }), null);
});

test("every declared milestone is reachable through the rule", () => {
  // Guards against a threshold being added to the list but made unreachable by
  // an off-by-one in streakAfterAnswer.
  for (const m of STREAK_MILESTONES) {
    assert.equal(
      crossedStreakMilestone({ todayLogCount: 0, runEndingYesterday: m - 1 }),
      m,
      `milestone ${m} should be reachable`,
    );
  }
});

test("no milestone fires twice for one crossing across a whole day", () => {
  // The full day-30 session, end to end: one crossing, then silence.
  const answers = [
    { todayLogCount: 0, runEndingYesterday: 29 },
    ...Array.from({ length: 19 }, (_, i) => ({
      todayLogCount: i + 1,
      runEndingYesterday: 29,
    })),
  ];
  const fired = answers.map(crossedStreakMilestone).filter((m) => m !== null);
  assert.deepEqual(fired, [30]);
});
