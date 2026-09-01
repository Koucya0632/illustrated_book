import assert from "node:assert/strict";
import test from "node:test";
import { studyAnswerOwnerMatches } from "../lib/study-answer-owner";

const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("immediate answers without an owner tag remain compatible", () => {
  assert.equal(studyAnswerOwnerMatches(undefined, userA), true);
});

test("durable answers are accepted only for the account that queued them", () => {
  assert.equal(studyAnswerOwnerMatches(userA.toUpperCase(), userA), true);
  assert.equal(studyAnswerOwnerMatches(userA, userB), false);
  assert.equal(studyAnswerOwnerMatches(null, userA), false);
});
