// Pins the machine gate's decision rules (docs/COMMUNITY_ATLAS_PLAN.md §5).
//
// The invariants that matter: clean content auto-publishes, anything risky goes
// to a human, faces/PII are never auto-rejected, and a classifier outage fails
// CLOSED (to review) rather than publishing unscreened content.

import assert from "node:assert/strict";
import test from "node:test";
import {
  decideAtlasModeration,
  detectPiiInText,
  runAtlasTextModeration,
  scoreVisionModeration,
} from "../lib/atlas/moderation";

test("a clean image auto-publishes", () => {
  const hits = scoreVisionModeration({
    safeSearch: { adult: "VERY_UNLIKELY", violence: "VERY_UNLIKELY", racy: "UNLIKELY" },
    faceConfidences: [],
    ocrText: "Fresh milk 500ml",
  });
  const decision = decideAtlasModeration(hits);
  assert.equal(decision.reviewStatus, "approved");
  assert.equal(decision.verdict, "approved");
});

test("likely adult content goes to a human", () => {
  const hits = scoreVisionModeration({ safeSearch: { adult: "LIKELY" } });
  assert.equal(decideAtlasModeration(hits).reviewStatus, "pending_review");
});

// Atlas users photograph people by accident constantly; a face is a privacy
// question for a human, never an automatic publish.
test("a detected face always goes to a human", () => {
  const hits = scoreVisionModeration({
    safeSearch: { adult: "VERY_UNLIKELY" },
    faceConfidences: [0.98],
  });
  assert.equal(decideAtlasModeration(hits).reviewStatus, "pending_review");
});

test("PII in OCR'd text goes to a human", () => {
  const hits = scoreVisionModeration({
    safeSearch: { adult: "VERY_UNLIKELY" },
    ocrText: "在留カード AB1234567 山田太郎",
  });
  assert.ok(hits.some((h) => h.category === "pii"));
  assert.equal(decideAtlasModeration(hits).reviewStatus, "pending_review");
});

test("classifier outage fails closed to human review", () => {
  const decision = decideAtlasModeration([], { degraded: true });
  assert.equal(decision.reviewStatus, "pending_review");
  assert.equal(decision.degraded, true);
});

test("hard auto-reject stays off until thresholds are calibrated", () => {
  // ATLAS_MOD_HARD_REJECT defaults to false, so even a maximal NSFW score
  // routes to a human rather than being rejected outright.
  const hits = scoreVisionModeration({ safeSearch: { adult: "VERY_LIKELY" } });
  assert.equal(decideAtlasModeration(hits).reviewStatus, "pending_review");
});

test("detectPiiInText catches common identifier shapes", () => {
  assert.equal(detectPiiInText("mail me at a.b@example.com"), true);
  assert.equal(detectPiiInText("4111 1111 1111 1111"), true);
  assert.equal(detectPiiInText("マイナンバーの申請"), true);
  assert.equal(detectPiiInText("a red kettle on the stove"), false);
  assert.equal(detectPiiInText("   "), false);
});

test("text moderation flags links as spam", () => {
  const hits = runAtlasTextModeration(["buy now https://spam.example", null]);
  assert.ok(hits.some((h) => h.category === "spam"));
  assert.equal(runAtlasTextModeration(["kettle", "水壺", null, null]).length, 0);
});
