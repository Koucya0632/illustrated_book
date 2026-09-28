// Pins the 個人筆記 rules (lib/word-notes/policy.ts, docs/MEMBERSHIP_TIER_STATUS.md §6 1.2).
//
// THE RED LINES:
//   - Under v1 the feature does not exist.
//   - A v2 non-member can still read and delete their notes; only writing is gated.
//   - Deleting is answered with the keep rule, never the write rule.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canWriteWordNotes,
  checkKeepNote,
  checkWriteNote,
  normalizeWordNote,
  wordNotesAvailable,
} from "../lib/word-notes/policy";

test("v1: not available, for anyone", () => {
  for (const tier of ["free", "lifetime", "pro"] as const) {
    const access = { tier, policy: "v1" } as const;
    assert.equal(wordNotesAvailable(access), false);
    assert.equal(canWriteWordNotes(access), false);
    assert.equal(checkKeepNote(access)?.status, 404);
    assert.equal(checkWriteNote(access)?.error, "not_available");
  }
});

test("v2: members write; a non-member keeps, reads and deletes but cannot write", () => {
  for (const tier of ["lifetime", "pro"] as const) {
    assert.equal(checkWriteNote({ tier, policy: "v2" }), null);
  }
  const free = { tier: "free", policy: "v2" } as const;
  assert.equal(checkKeepNote(free), null);
  assert.equal(canWriteWordNotes(free), false);
  assert.deepEqual(checkWriteNote(free), { status: 402, error: "membership_required", upgradeTo: "lifetime" });
});

test("a note is 1–500 characters after trimming", () => {
  assert.equal(normalizeWordNote("  記得跟 cup 分開  "), "記得跟 cup 分開");
  assert.equal(normalizeWordNote(" \n "), null);
  assert.equal(normalizeWordNote(null), null);
  assert.equal(normalizeWordNote("字".repeat(500)), "字".repeat(500));
  assert.equal(normalizeWordNote("字".repeat(501)), null);
});

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("delete asks the keep rule, write asks the write rule", () => {
  const src = read("app/api/users/word-notes/[wordId]/route.ts");
  const post = src.slice(src.indexOf("export async function POST"), src.indexOf("export async function DELETE"));
  const del = src.slice(src.indexOf("export async function DELETE"));
  assert.ok(post.includes("checkWriteNote("));
  assert.ok(del.includes("checkKeepNote("));
  assert.ok(!del.includes("checkWriteNote("));
});

test("a word merge carries notes to the surviving word without dropping either", () => {
  const src = read("lib/main-word-merges.ts");
  assert.ok(src.includes("INSERT INTO user_word_notes"));
  assert.ok(src.includes("DELETE FROM user_word_notes WHERE word_id = ${entry.sourceId}"));
});
