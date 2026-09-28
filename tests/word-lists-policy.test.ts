// Pins the 個人詞表 rules (lib/word-lists/policy.ts, docs/MEMBERSHIP_TIER_STATUS.md §6 1.1).
//
// THE RED LINES:
//   - Under v1 the feature does not exist, for anyone.
//   - A v2 non-member keeps what they had: reading, reordering, removing a
//     word and deleting a list are never gated. Creating, renaming, adding
//     and studying are.
//   - Past the list cap after a downgrade, the first N lists in the user's
//     own order stay usable; the rest are locked, not deleted.
//   - The routes ask these rules — including the study queue, so a list can't
//     be studied by going around the list screens.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  checkAddWord,
  checkCreateList,
  checkEditList,
  checkKeepList,
  checkStudyList,
  lockedWordListIds,
  normalizeWordListName,
  WORD_LIST_LIMITS,
  wordListsAvailable,
} from "../lib/word-lists/policy";

const v1Free = { tier: "free", policy: "v1" } as const;
const v1Pro = { tier: "pro", policy: "v1" } as const;
const free = { tier: "free", policy: "v2" } as const;
const lifetime = { tier: "lifetime", policy: "v2" } as const;
const pro = { tier: "pro", policy: "v2" } as const;

test("v1: not available to anyone, and every route says so", () => {
  for (const access of [v1Free, v1Pro]) {
    assert.equal(wordListsAvailable(access), false);
    assert.equal(checkKeepList(access)?.error, "not_available");
    assert.equal(checkCreateList(access, 0)?.status, 404);
    assert.equal(checkAddWord(access, false, 0)?.error, "not_available");
    assert.equal(checkStudyList(access, false)?.error, "not_available");
  }
});

test("limits: lifetime 20 × 500, Pro 100 × 2000, non-member 0", () => {
  assert.deepEqual(WORD_LIST_LIMITS.lifetime, { lists: 20, words: 500 });
  assert.deepEqual(WORD_LIST_LIMITS.pro, { lists: 100, words: 2000 });
  assert.deepEqual(WORD_LIST_LIMITS.free, { lists: 0, words: 0 });
});

test("a v2 non-member keeps their lists but cannot grow or study them", () => {
  assert.equal(checkKeepList(free), null);
  assert.deepEqual(checkCreateList(free, 0), {
    status: 402,
    error: "membership_required",
    upgradeTo: "lifetime",
  });
  assert.equal(checkEditList(free, false)?.error, "membership_required");
  assert.equal(checkAddWord(free, false, 0)?.status, 402);
  assert.equal(checkStudyList(free, false)?.status, 402);
});

test("members create up to their cap; lifetime is pointed at Pro, Pro is told no", () => {
  assert.equal(checkCreateList(lifetime, 19), null);
  assert.deepEqual(checkCreateList(lifetime, 20), {
    status: 402,
    error: "word_list_limit",
    upgradeTo: "pro",
  });
  assert.equal(checkCreateList(pro, 99), null);
  assert.deepEqual(checkCreateList(pro, 100), {
    status: 429,
    error: "word_list_limit",
    upgradeTo: null,
  });
});

test("adding stops at the word cap; a list over it can still be studied", () => {
  assert.equal(checkAddWord(lifetime, false, 499), null);
  assert.equal(checkAddWord(lifetime, false, 500)?.error, "word_limit");
  assert.equal(checkAddWord(pro, false, 2000)?.status, 429);
  // A Pro list of 2000 words after dropping to lifetime.
  assert.equal(checkStudyList(lifetime, false), null);
});

test("past the list cap, the first N in the user's order stay usable", () => {
  const ids = Array.from({ length: 23 }, (_, i) => `l${i}`);
  assert.deepEqual(lockedWordListIds(ids, lifetime), ["l20", "l21", "l22"]);
  assert.deepEqual(lockedWordListIds(ids, pro), []);
  assert.equal(lockedWordListIds(ids, free).length, 23);
  assert.equal(checkEditList(lifetime, true)?.error, "word_list_locked");
  assert.equal(checkAddWord(lifetime, true, 0)?.error, "word_list_locked");
  assert.equal(checkStudyList(lifetime, true)?.error, "word_list_locked");
});

test("names are trimmed, 1–40 characters", () => {
  assert.equal(normalizeWordListName("  廚房 "), "廚房");
  assert.equal(normalizeWordListName("   "), null);
  assert.equal(normalizeWordListName(42), null);
  assert.equal(normalizeWordListName("字".repeat(40)), "字".repeat(40));
  assert.equal(normalizeWordListName("字".repeat(41)), null);
});

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the study queue gates ?list= with the same study rule", () => {
  const src = read("app/api/study/queue/route.ts");
  assert.ok(src.includes('searchParams.get("list")'));
  assert.ok(src.includes("checkStudyList("), "queue must ask checkStudyList");
  assert.ok(src.includes("getWordList(userId,"), "list must be looked up as the caller's own");
  assert.ok(src.includes("wordListId }"), "fetchDue must receive the list filter");
});

test("fetchDue applies the list filter to both new and review cards", () => {
  const src = read("lib/cards-db.ts");
  assert.equal(src.match(/\$\{listFilter\}/g)?.length, 2);
});

test("removing a word is answered before any membership check", () => {
  const src = read("app/api/users/word-lists/[id]/words/route.ts");
  const post = src.slice(src.indexOf("export async function POST"));
  assert.ok(post.indexOf("removeWordFromList(") < post.indexOf("checkAddWord("));
});

test("reorder and delete only require the feature to exist", () => {
  for (const route of ["app/api/users/word-lists/order/route.ts", "app/api/users/word-lists/[id]/route.ts"]) {
    const src = read(route);
    const handler = src.slice(src.indexOf(route.endsWith("order/route.ts") ? "export async function POST" : "export async function DELETE"));
    assert.ok(handler.includes("checkKeepList("));
    assert.ok(!handler.includes("checkEditList("));
  }
});

test("a word merge carries list entries to the surviving word", () => {
  const src = read("lib/main-word-merges.ts");
  assert.ok(src.includes("INSERT INTO user_word_list_items"));
  assert.ok(src.includes("DELETE FROM user_word_list_items WHERE word_id = ${entry.sourceId}"));
});
