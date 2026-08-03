// Pins the collection submit gate (lib/atlas/collection-submit-pipeline.ts).
//
// Member images cross the item gate separately. This test pins the collection's
// own title/description gate: a clean value clears, while spam or PII waits for
// a human.

import assert from "node:assert/strict";
import test from "node:test";
import { decideAtlasModeration, runAtlasTextModeration } from "../lib/atlas/moderation";

function gate(title: string, description: string | null) {
  return decideAtlasModeration(runAtlasTextModeration([title, description]));
}

test("a clean title + description auto-publishes", () => {
  const decision = gate("生活日常", "在生活中常用的日文單字");
  assert.equal(decision.reviewStatus, "approved");
  assert.equal(decision.verdict, "approved");
});

test("a null description is fine", () => {
  assert.equal(gate("交通工具", null).reviewStatus, "approved");
});

test("a URL in the title goes to a human (spam)", () => {
  const decision = gate("關注 https://spam.example", "買讚");
  assert.ok(decision.hits.some((h) => h.category === "spam"));
  assert.equal(decision.reviewStatus, "pending_review");
});

test("PII in the description goes to a human", () => {
  const decision = gate("我的合集", "聯絡我 test@example.com");
  assert.ok(decision.hits.some((h) => h.category === "pii"));
  assert.equal(decision.reviewStatus, "pending_review");
});
