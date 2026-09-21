// Pins 加入合集 的兩個問題 (lib/atlas/collection-membership.ts)：
// 「加得進去嗎」，以及「加進去之後，誰帶它過閘」。
//
// 來歷：未公開的項目本來加不進已公開的合集，伺服器回一個沒有理由的 409，畫面顯示
// 「伺服器出了點問題（409），請稍後再試」，而唯一的解法是把整個合集從物見下架。
// 現在它加得進去，只是自己去過閘，通過前對外隱形。

import assert from "node:assert/strict";
import test from "node:test";
import {
  collectionAcceptsUnpublishedMembers,
  memberNeedsOwnReview,
  messageForRefusal,
  refusalForAdd,
} from "../lib/atlas/collection-membership";

test("一個還沒上架的合集自己帶成員過閘", () => {
  for (const status of ["draft", "rejected", "withdrawn"]) {
    assert.equal(collectionAcceptsUnpublishedMembers(status), true, status);
    assert.equal(memberNeedsOwnReview(status), false, status);
  }
});

test("已經上架或正在審核的合集帶不動，成員自己去", () => {
  for (const status of ["approved", "pending", "pending_auto", "pending_review"]) {
    assert.equal(collectionAcceptsUnpublishedMembers(status), false, status);
    assert.equal(memberNeedsOwnReview(status), true, status);
  }
});

/// 下架的合集本來就編不動；INSERT 也擋著它。這裡只確認它不會被當成「還開著」。
test("被下架的合集不算開著", () => {
  assert.equal(collectionAcceptsUnpublishedMembers("takedown"), false);
});

test("已經在合集裡了，不是失敗也不是重複加入", () => {
  assert.equal(refusalForAdd({ isMember: true, itemIsAddable: true }), "already_member");
  assert.match(messageForRefusal("already_member"), /已經在合集裡/);
});

/// 已刪除、還沒確認、語言不符、被拒絕或下架：這些跟合集公不公開無關，
/// 所以文案不該叫人去取消公開。
test("項目本身不合格時，不怪罪到合集頭上", () => {
  const refusal = refusalForAdd({ isMember: false, itemIsAddable: false });
  assert.equal(refusal, "not_addable");
  assert.doesNotMatch(messageForRefusal(refusal), /取消公開|公開/);
});

test("每一種拒絕都有一句話", () => {
  for (const refusal of ["already_member", "not_addable"] as const) {
    assert.ok(messageForRefusal(refusal).length > 0, refusal);
  }
});
