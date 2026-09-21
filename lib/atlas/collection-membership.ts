// 一個項目能不能加進一個合集 —— 以及加進去之後，它要走哪一條審核路。
//
// 未公開的成員有兩種進入物見的方式，差別在合集當下在哪裡：
//
//   * 合集還沒上架（draft / rejected / withdrawn）：成員**跟著合集一起送審**，
//     公開合集時整批過閘，全部通過才一起出現。
//   * 合集已經上架或正在審核：成員**自己去過閘**。它立刻加進合集，但在通過之前
//     對外是隱形的（公開查詢 INNER JOIN `public_item_id`，那一格還是 NULL），
//     通過的瞬間才出現在合集裡。
//
// 第二條路以前不存在，於是守衛只好禁止——作者想加一張新圖，唯一的辦法是把整個
// 合集從物見下架、加完再公開一次，而重新公開會再跑一次文字閘，可能把一個本來活著
// 的合集丟進人工佇列。現在合集一秒都不用下架。
//
// 沒變的是那條界線：**沒過閘的照片不會出現在物見**。變的只是「過閘」不再一定要
// 整個合集陪著跑一次。

/** 成員可以等合集一起送審的狀態：沒上架，也不在審核途中。 */
export const ATLAS_COLLECTION_OPEN_STATUSES = ["draft", "rejected", "withdrawn"] as const;

export type AtlasCollectionAddRefusal = "already_member" | "not_addable";

export interface AtlasCollectionAddFacts {
  /** The item is already in this collection. */
  isMember: boolean;
  /** Owned by the collection's owner, same language, confirmed, not rejected. */
  itemIsAddable: boolean;
}

export function collectionAcceptsUnpublishedMembers(reviewStatus: string): boolean {
  return (ATLAS_COLLECTION_OPEN_STATUSES as readonly string[]).includes(reviewStatus);
}

/**
 * Whether a member joining *now* has to be sent through the item gate on its
 * own. True exactly when the collection can no longer carry it: it is live, or
 * already inside the gate itself.
 */
export function memberNeedsOwnReview(collectionReviewStatus: string): boolean {
  return !collectionAcceptsUnpublishedMembers(collectionReviewStatus);
}

/**
 * Why the insert matched nothing. Only called after one did — the happy path
 * never reaches here, so "everything looks fine" is itself a refusal (something
 * changed between the two queries) rather than an impossible state.
 */
export function refusalForAdd(facts: AtlasCollectionAddFacts): AtlasCollectionAddRefusal {
  if (facts.isMember) return "already_member";
  return "not_addable";
}

/**
 * The fallback sentence, in zh-Hant. A client that knows the reason code says
 * this in its own UI language instead; this is what anything else gets.
 */
export function messageForRefusal(refusal: AtlasCollectionAddRefusal): string {
  switch (refusal) {
    case "already_member":
      return "這個項目已經在合集裡了。";
    case "not_addable":
      return "這個項目現在不能加入這個合集。";
  }
}
