import assert from "node:assert/strict";
import test from "node:test";

import { compare, issueKey, scoreFrom } from "../evals/run-eval.mjs";

const FIXTURE_SHA = "a".repeat(64);
const GRADER_SHA = "b".repeat(64);

function record(overrides: Record<string, unknown> = {}) {
  return {
    target: "atlas-examples",
    source: "fixture",
    recordedAt: "2026-08-30T00:00:00.000Z",
    fixtureSha256: FIXTURE_SHA,
    graderSha256: GRADER_SHA,
    score: {
      scope: { words: 476, examples: 952 },
      tiers: { mechanical: "passed", semantic: "not-scored" },
      passRate: 1,
      failingWords: 0,
      issueCount: 0,
      categories: {},
      issueKeys: [] as string[],
    },
    ...overrides,
  };
}

function withIssues(base: ReturnType<typeof record>, keys: string[]) {
  return { ...base, score: { ...base.score, issueKeys: keys } };
}

test("an identical run is unchanged", () => {
  const result = compare(record(), record());
  assert.equal(result.verdict, "unchanged");
  assert.deepEqual(result.newIssues, []);
  assert.deepEqual(result.fixedIssues, []);
});

test("a new issue key is a regression", () => {
  const baseline = record();
  const current = withIssues(record(), ["span-coverage|access-card|1315||reconstructed"]);
  const result = compare(baseline, current);
  assert.equal(result.verdict, "regressed");
  assert.deepEqual(result.newIssues, ["span-coverage|access-card|1315||reconstructed"]);
});

test("a disappeared issue key is an improvement, not a pass", () => {
  const baseline = withIssues(record(), ["span-coverage|access-card|1315||reconstructed"]);
  const result = compare(baseline, record());
  assert.equal(result.verdict, "improved");
  assert.deepEqual(result.fixedIssues, ["span-coverage|access-card|1315||reconstructed"]);
});

test("one fix plus one new break is a regression, not a wash", () => {
  // The whole reason the baseline stores keys instead of a count: these two runs both
  // report exactly one issue, and they are not the same state.
  const baseline = withIssues(record(), ["a|word-one|1||field"]);
  const current = withIssues(record(), ["b|word-two|2||field"]);
  const result = compare(baseline, current);
  assert.equal(result.verdict, "regressed");
  assert.deepEqual(result.newIssues, ["b|word-two|2||field"]);
  assert.deepEqual(result.fixedIssues, ["a|word-one|1||field"]);
});

test("a moved fixture makes a fixture-mode delta unattributable", () => {
  const current = record({ fixtureSha256: "c".repeat(64) });
  const result = compare(record(), current);
  assert.equal(result.verdict, "incomparable");
  assert.match(result.notes.join(" "), /cannot be attributed/);
});

test("a moved fixture is only a note in database mode, where input is meant to move", () => {
  const baseline = record({ source: "database" });
  const current = record({ source: "database", fixtureSha256: "c".repeat(64) });
  const result = compare(baseline, current);
  assert.equal(result.verdict, "unchanged");
  assert.match(result.notes.join(" "), /frozen fixture changed/);
});

test("baselines never compare across sources", () => {
  const result = compare(record({ source: "fixture" }), record({ source: "database" }));
  assert.equal(result.verdict, "incomparable");
});

test("a moved grader is flagged as the ruler moving", () => {
  const current = record({ graderSha256: "d".repeat(64) });
  const result = compare(record(), current);
  assert.equal(result.verdict, "unchanged");
  assert.match(result.notes.join(" "), /grader changed/);
});

test("scope drift is reported even when the issue set is identical", () => {
  const baseline = record({ source: "database" });
  const current = record({ source: "database" });
  current.score = { ...current.score, scope: { words: 480, examples: 960 } };
  const result = compare(baseline, current);
  assert.match(result.notes.join(" "), /scope moved: 476 → 480 words/);
});

test("the semantic tier's own incompleteness is not scored as a defect", () => {
  // The grader reports `review-incomplete` when nobody filled in the per-item semantic
  // review. That is a statement about scope, and folding it into the number would make
  // every unreviewed run look like it had one broken word.
  const report = {
    counts: { words: 2, examples: 4 },
    mechanicalStatus: "passed",
    semanticReviewStatus: "pending",
    summary: { total: 1, categories: { "review-incomplete": 1 } },
    issues: [{ category: "review-incomplete", wordId: null, field: "review" }],
  };
  const score = scoreFrom(report, { scoredTiers: ["mechanical"] });
  assert.equal(score.issueCount, 0);
  assert.equal(score.passRate, 1);
  assert.deepEqual(score.categories, {});
  assert.equal(score.tiers.semantic, "not-scored");
});

test("pass rate counts words, and one word with two broken examples fails once", () => {
  const report = {
    counts: { words: 4, examples: 8 },
    mechanicalStatus: "failed",
    semanticReviewStatus: "pending",
    summary: { total: 2, categories: {} },
    issues: [
      { category: "example-count", wordId: "onigiri", exampleId: "1", field: "en" },
      { category: "span-coverage", wordId: "onigiri", exampleId: "2", field: "ja" },
    ],
  };
  const score = scoreFrom(report, { scoredTiers: ["mechanical"] });
  assert.equal(score.failingWords, 1);
  assert.equal(score.issueCount, 2);
  assert.equal(score.passRate, 0.75);
});

test("issue keys separate slot and field", () => {
  assert.equal(
    issueKey({ category: "c", wordId: "w", exampleId: "e", slot: "s", field: "f" }),
    "c|w|e|s|f",
  );
  assert.equal(issueKey({ category: "c", wordId: "w" }), "c|w|||");
});
