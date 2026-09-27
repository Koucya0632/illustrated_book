// Pins the membership rule (docs/MEMBERSHIP_ENGINEERING_CHECKLIST.md §1, decided
// 2026-09-27): a recognition that errors OR comes back with nothing to pick does
// not use up the monthly quota. getAtlasUsage counts only `success` rows, so the
// write side must mark an empty result as not successful.

import assert from "node:assert/strict";
import test from "node:test";
import { emptyRecognitionResult, recognitionFoundSomething } from "../lib/atlas/vision-provider";

const candidate = {
  label: "apple",
  normalizedLabel: "apple",
  zhHant: "蘋果",
  gloss: null,
  confidence: 0.9,
  taxonomyNodeId: null,
};

test("an empty result (no labels, or a manual-only provider) is not a success", () => {
  assert.equal(recognitionFoundSomething(emptyRecognitionResult("google-vision", "primary", "none")), false);
});

test("a result with a primary candidate is a success", () => {
  const r = { ...emptyRecognitionResult("google-vision", "primary", ""), primary: [candidate] };
  assert.equal(recognitionFoundSomething(r), true);
});

test("an escalated result with only fine candidates is a success", () => {
  const r = { ...emptyRecognitionResult("openai-direct", "escalated", ""), fine: [candidate] };
  assert.equal(recognitionFoundSomething(r), true);
});
