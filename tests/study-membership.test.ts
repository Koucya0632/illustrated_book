// Pins the official-atlas study gate (docs/MEMBERSHIP_ENGINEERING_CHECKLIST.md
// §3). In v2 a signed-in non-member learns and reviews only fruits and bedroom;
// their 自製圖鑑 and saved 物見 cards stay out of the queue. Members and v1
// are untouched.
//
// THE RED LINES:
//   - "No filter" must never widen a non-member to the whole catalogue. An empty
//     publicCategories list means ALL categories to fetchDue, so the gate has to
//     replace it with the whitelist, not pass it through.
//   - The answer route re-checks with the same rule, so a client (or a cached
//     queue from before the cutover) can't write progress the queue wouldn't serve.
//   - The whitelist is category ids, never a word count: new words published
//     into fruits/bedroom join automatically.

import assert from "node:assert/strict";
import test from "node:test";
import {
  FREE_STUDY_CATEGORIES,
  applyMembershipStudyScope,
  canStudyCard,
} from "../lib/study-membership";
import { resolveQueueThemeScope } from "../lib/study-sources";

const free2 = { tier: "free" as const, policy: "v2" as const };
const life2 = { tier: "lifetime" as const, policy: "v2" as const };
const free1 = { tier: "free" as const, policy: "v1" as const };

test("the whitelist is fruits and bedroom, by category id", () => {
  assert.deepEqual([...FREE_STUDY_CATEGORIES].sort(), ["bedroom", "fruits"]);
});

test("v1 and members pass through untouched", () => {
  const scope = resolveQueueThemeScope([], false);
  assert.deepEqual(applyMembershipStudyScope(scope, free1), scope);
  assert.deepEqual(applyMembershipStudyScope(scope, life2), scope);
});

test("v2 non-member with no filter gets exactly the whitelist, not everything", () => {
  const s = applyMembershipStudyScope(resolveQueueThemeScope([], false), free2);
  assert.deepEqual([...s.publicCategories].sort(), ["bedroom", "fruits"]);
  assert.equal(s.shouldFetchPublic, true);
  assert.equal(s.wantsCustom, false);
  assert.equal(s.wantsCommunity, false);
});

test("v2 non-member picking kitchen+fruits keeps only fruits", () => {
  const s = applyMembershipStudyScope(resolveQueueThemeScope(["kitchen", "fruits"], false), free2);
  assert.deepEqual(s.publicCategories, ["fruits"]);
  assert.equal(s.shouldFetchPublic, true);
});

test("v2 non-member picking only locked themes fetches nothing public", () => {
  const s = applyMembershipStudyScope(resolveQueueThemeScope(["kitchen"], false), free2);
  assert.equal(s.shouldFetchPublic, false);
});

test("v2 non-member review is limited to the whitelist too — other progress is kept, not reviewed", () => {
  const s = applyMembershipStudyScope(resolveQueueThemeScope([], true), free2);
  assert.deepEqual([...s.publicCategories].sort(), ["bedroom", "fruits"]);
  assert.equal(s.wantsCustom, false);
  assert.equal(s.wantsCommunity, false);
});

test("answer re-check: same rule, per card", () => {
  assert.equal(canStudyCard(free2, { source: "public", category: "fruits" }), true);
  assert.equal(canStudyCard(free2, { source: "public", category: "kitchen" }), false);
  assert.equal(canStudyCard(free2, { source: "custom" }), false);
  assert.equal(canStudyCard(free2, { source: "community" }), false);
  assert.equal(canStudyCard(life2, { source: "public", category: "kitchen" }), true);
  assert.equal(canStudyCard(free1, { source: "custom" }), true);
});

// ---- Wiring: both study routes go through the gate ----
import { readFileSync } from "node:fs";
const route = (p: string) => readFileSync(new URL(`../app/api/study/${p}/route.ts`, import.meta.url), "utf8");

test("the queue applies the gate on top of the user's theme scope", () => {
  assert.match(route("queue"), /applyMembershipStudyScope\(\s*resolveQueueThemeScope\(/);
});

test("the answer route checks every source, and refuses with 200 — never a 4xx that wedges the iOS outbox", () => {
  const src = route("answer");
  assert.ok(src.includes('canStudyCard(access, { source: "custom" })'));
  assert.ok(src.includes('canStudyCard(access, { source: "community" })'));
  assert.ok(src.includes('canStudyCard(access, { source: "public"'));
  assert.match(src, /gated: "membership_required" \}, \{ status: 200 \}/);
});
