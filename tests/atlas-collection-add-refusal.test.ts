// Pins why an add is refused (lib/atlas/collection-membership.ts).
//
// The bug this came from: a private item offered by the picker, added to an
// already-published collection, answered 409 with no reason — which reached the
// author as 「伺服器出了點問題（409），請稍後再試」 about a rule they could have
// followed. The rule is a pair (item × collection), so these cases are written
// as pairs.

import assert from "node:assert/strict";
import test from "node:test";
import {
  collectionAcceptsUnpublishedMembers,
  messageForRefusal,
  refusalForAdd,
  type AtlasCollectionAddFacts,
} from "../lib/atlas/collection-membership";

function facts(over: Partial<AtlasCollectionAddFacts> = {}): AtlasCollectionAddFacts {
  return {
    collectionReviewStatus: "draft",
    isMember: false,
    itemIsPublic: false,
    itemIsAddable: true,
    ...over,
  };
}

test("a live collection refuses an item that is not public yet", () => {
  const refusal = refusalForAdd(facts({ collectionReviewStatus: "approved" }));
  assert.equal(refusal, "collection_live");
  assert.match(messageForRefusal(refusal), /取消公開/);
});

test("a collection in review refuses it too, and says to wait rather than to withdraw", () => {
  for (const status of ["pending", "pending_auto", "pending_review"]) {
    const refusal = refusalForAdd(facts({ collectionReviewStatus: status }));
    assert.equal(refusal, "collection_in_review", status);
    assert.match(messageForRefusal(refusal), /審核/);
    assert.doesNotMatch(messageForRefusal(refusal), /取消公開/);
  }
});

test("a live collection still takes an item that is already public", () => {
  // Not a refusal this function should ever be asked about: the INSERT would
  // have matched. Reaching here means something changed underneath.
  assert.equal(
    refusalForAdd(facts({ collectionReviewStatus: "approved", itemIsPublic: true })),
    "not_addable",
  );
});

test("the open statuses take unpublished members", () => {
  for (const status of ["draft", "rejected", "withdrawn"]) {
    assert.equal(collectionAcceptsUnpublishedMembers(status), true, status);
  }
  for (const status of ["approved", "pending", "pending_auto", "pending_review", "takedown"]) {
    assert.equal(collectionAcceptsUnpublishedMembers(status), false, status);
  }
});

test("membership wins over everything else: the end state already holds", () => {
  assert.equal(
    refusalForAdd(facts({ isMember: true, collectionReviewStatus: "approved" })),
    "already_member",
  );
});

test("an item the guard rejects outright is not blamed on the collection", () => {
  // Deleted, unconfirmed, wrong language, rejected: nothing about publishing
  // would make it addable, so it must not read as 「先取消公開」.
  const refusal = refusalForAdd(
    facts({ itemIsAddable: false, collectionReviewStatus: "approved" }),
  );
  assert.equal(refusal, "not_addable");
  assert.doesNotMatch(messageForRefusal(refusal), /取消公開/);
});

test("every refusal has a sentence", () => {
  for (const refusal of [
    "already_member",
    "collection_live",
    "collection_in_review",
    "not_addable",
  ] as const) {
    assert.ok(messageForRefusal(refusal).length > 0, refusal);
  }
});
