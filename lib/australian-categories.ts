import type { LearningDirection } from "./settings";
import type { AustralianWordVariants } from "./australian-word-variants";

/** Reserved until the full six-card regional release is approved and active. */
export const AUSTRALIAN_RENTAL_CATEGORY = "australia-housing";
export const AUSTRALIAN_RENTAL_WORDS = ["share-house", "view-a-room", "bills-included", "rental-bond", "condition-report", "tenancy-agreement"] as const;

export function australianRentalBatchActive(variants: AustralianWordVariants): boolean {
  return AUSTRALIAN_RENTAL_WORDS.every((id) => variants[id]?.visibility === "australia-only");
}

/** Old clients that do not send a direction retain the old category list.
 * Reserved topics remain hidden during partial rollouts or before activation. */
export function filterAustralianCategories<T extends { id: string }>(
  categories: readonly T[], direction: LearningDirection | undefined, variants: AustralianWordVariants,
): T[] {
  const active = direction === "zh-en" && australianRentalBatchActive(variants);
  return categories.filter((category) => category.id !== AUSTRALIAN_RENTAL_CATEGORY || active);
}

/** Clients without a valid direction cannot discover regional rental words,
 * because their category request also cannot select a regional topic. */
export function legacyRentalWordVisible(id: string, requestUrl: string): boolean {
  const direction = new URL(requestUrl).searchParams.get("learning");
  return direction === "zh-en" || direction === "zh-ja" || !(AUSTRALIAN_RENTAL_WORDS as readonly string[]).includes(id);
}

/** Apply a direction-specific view of saved selections without deleting them.
 * The caller decides how to handle a selection with no applicable topics. */
export function studyCategoriesForDirection(categories: readonly string[], direction: LearningDirection): string[] {
  return categories.filter((id) => direction === "zh-en" || id !== AUSTRALIAN_RENTAL_CATEGORY);
}

/** Editing Japan's visible choices must not erase the saved Australian topic. */
export function updateStudyCategoriesForDirection(
  current: readonly string[], selected: readonly string[], direction: LearningDirection,
): string[] {
  const next = [...new Set(selected)];
  if (direction === "zh-ja" && current.includes(AUSTRALIAN_RENTAL_CATEGORY) && !next.includes(AUSTRALIAN_RENTAL_CATEGORY)) next.push(AUSTRALIAN_RENTAL_CATEGORY);
  return next;
}

/** A sharded response must not expose a partial rental batch even when
 * different cache shards were populated at different times. */
export function filterIncompleteRentalRows<T extends { word: { id: string; category: string } }>(rows: readonly T[]): T[] {
  const complete = AUSTRALIAN_RENTAL_WORDS.every((id) => rows.some((row) => row.word.id === id && row.word.category === AUSTRALIAN_RENTAL_CATEGORY));
  return complete ? [...rows] : rows.filter((row) => !(AUSTRALIAN_RENTAL_WORDS as readonly string[]).includes(row.word.id));
}
