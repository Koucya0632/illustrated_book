// 一個項目能不能加進一個合集 —— 以及被拒絕的時候，那句話要怎麼說。
//
// 資格不是項目的屬性，是「項目 × 合集」的一對：同一張未公開的圖鑑，加進草稿合集
// 可以（它會隨合集一起送審），加進已經公開的合集不行（那等於把沒過審的照片直接放上
// 公開的架子，而審核閘是公開側唯一的界線）。
//
// `addAtlasCollectionItem` 的 INSERT 用 SQL 執行這條規則；這個模組用同一條規則解釋
// 它，所以被拒絕時有一個名字，而不是一個 `false`。兩邊共用
// ATLAS_COLLECTION_OPEN_STATUSES，不各寫一份清單。
//
// 名字（不是句子）才是給客戶端看的答案：iOS 端把 reason 對到自己的在地化文案，
// `message` 只是給沒有對照表的客戶端與其他消費者的退路。

/** 還能收未公開成員的合集狀態：沒上架、也沒在審核途中。 */
export const ATLAS_COLLECTION_OPEN_STATUSES = ["draft", "rejected", "withdrawn"] as const;

export type AtlasCollectionAddRefusal =
  | "already_member"
  | "collection_live"
  | "collection_in_review"
  | "not_addable";

export interface AtlasCollectionAddFacts {
  /** `atlas_collections.review_status`. */
  collectionReviewStatus: string;
  /** The item is already in this collection. */
  isMember: boolean;
  /** The item has an approved row in `atlas_public_items`. */
  itemIsPublic: boolean;
  /** Owned by the collection's owner, same language, confirmed, not rejected. */
  itemIsAddable: boolean;
}

export function collectionAcceptsUnpublishedMembers(reviewStatus: string): boolean {
  return (ATLAS_COLLECTION_OPEN_STATUSES as readonly string[]).includes(reviewStatus);
}

/**
 * Why the insert matched nothing. Only called after one did — the happy path
 * never reaches here, so "everything looks fine" is itself a refusal (something
 * changed between the two queries) rather than an impossible state.
 */
export function refusalForAdd(facts: AtlasCollectionAddFacts): AtlasCollectionAddRefusal {
  if (facts.isMember) return "already_member";
  if (!facts.itemIsAddable) return "not_addable";
  // The item itself is fine, so it is the collection that refuses it.
  if (!facts.itemIsPublic && !collectionAcceptsUnpublishedMembers(facts.collectionReviewStatus)) {
    if (facts.collectionReviewStatus === "approved") return "collection_live";
    if (facts.collectionReviewStatus.startsWith("pending")) return "collection_in_review";
  }
  return "not_addable";
}

/**
 * The fallback sentence, in zh-Hant. A client that knows the reason code says
 * this in its own UI language instead; this is what anything else gets.
 * Each one names the way out, because "cannot add item" is advice nobody can
 * follow — 取消公開 is the remedy for a live collection, and waiting is the
 * remedy for one in review.
 */
export function messageForRefusal(refusal: AtlasCollectionAddRefusal): string {
  switch (refusal) {
    case "already_member":
      return "這個項目已經在合集裡了。";
    case "collection_live":
      return "合集已公開，只能加入已公開的項目。先取消公開，加入後再重新公開。";
    case "collection_in_review":
      return "合集正在審核中，審核結束後才能加入未公開的項目。";
    case "not_addable":
      return "這個項目現在不能加入這個合集。";
  }
}
