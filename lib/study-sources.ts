// Which sources a study queue draws from, given the user's theme selection.
//
// The theme picker mixes two kinds of thing in one list. Most entries are real
// `words.category` ids (kitchen, bathroom…), but 自定義 and 物見 are *synthetic*:
// they name a source, not a category, and no dictionary row carries them. That
// mix is what this module exists to resolve, and getting it wrong is not
// theoretical — picking 物見 alone used to hand the learner their own 自製圖鑑
// cards, because "no public category survived the filter" was being read as
// "the user applied no filter".
//
// Those are different statements. The first is true whenever the only things
// ticked are synthetic; the second is true only when nothing is ticked at all.
//
// Extracted from `app/api/study/queue/route.ts` so the table below can be
// asserted by *calling* it. The previous test matched the route's source text
// against a regex, which can only ever report that nobody edited the line —
// never that the line is right — and it duly froze the bug in place.
//
//   選擇                    publicCategories   custom   community   fetchPublic
//   ────────────────────────────────────────────────────────────────────────
//   （空）                  []                 是       否          是
//   ["kitchen"]             ["kitchen"]        否       否          是
//   ["custom"]              []                 是       否          否
//   ["community"]           []                 否       是          否
//   ["kitchen","custom"]    ["kitchen"]        是       否          是
//   複習（任何選擇）        []                 是       是          是

export const CUSTOM_CATEGORY = "custom";
export const COMMUNITY_CATEGORY = "community";

export interface QueueThemeScope {
  /** Real `words.category` ids to filter the public dictionary by. */
  publicCategories: string[];
  /** Whether the user's own 自製圖鑑 cards join the queue. */
  wantsCustom: boolean;
  /** Whether saved 物見 cards join the queue. */
  wantsCommunity: boolean;
  /** Whether the public dictionary is queried at all. */
  shouldFetchPublic: boolean;
}

/**
 * THEMES SCOPE LEARNING, NOT REVIEW. This is what the theme picker promises in
 * so many words (「複習不分主題，所有學過的字都會排進來」), and review is the half
 * where it matters most: a card already learned must come back on schedule, or
 * the SRS silently drops it. Unticking a theme means "stop teaching me new
 * ones", never "abandon what I already learned".
 *
 * Resolved in one place rather than per-source because the three sources
 * disagreed about what an empty filter means (custom: include, community:
 * exclude, public: include), and the clients disagreed too — iOS sends no
 * categories for review, the web sends them for every mode.
 */
export function resolveQueueThemeScope(
  categories: string[],
  reviewOnly: boolean,
): QueueThemeScope {
  const publicCategories = reviewOnly
    ? []
    : categories.filter(
        (category) =>
          category !== CUSTOM_CATEGORY && category !== COMMUNITY_CATEGORY,
      );

  // 自製圖鑑 joins when explicitly ticked, or when the user has applied no
  // filter at all — custom is part of "all your studied words".
  //
  // `categories.length`, not `publicCategories.length`: the latter is empty
  // whenever the only ticked themes are synthetic, so testing it treated
  // 「只勾物見」 as 「什麼都沒勾」 and served the learner their own captures under
  // someone else's theme.
  const wantsCustom =
    reviewOnly ||
    categories.includes(CUSTOM_CATEGORY) ||
    categories.length === 0;

  // 物見 is opt-in for NEW cards, unlike custom: someone who has saved nothing
  // should not be handed an empty extra theme, and the content is other
  // people's work. Review is not opt-in — see above.
  const wantsCommunity = reviewOnly || categories.includes(COMMUNITY_CATEGORY);

  // In review every source is in, so an unfiltered public fetch is exactly what
  // "all your studied words" means. Without `reviewOnly` here, a learner
  // reviewing with only 物見 ticked would send one category, leave
  // `publicCategories` empty, and lose every official word they had learned.
  const shouldFetchPublic =
    reviewOnly || categories.length === 0 || publicCategories.length > 0;

  return { publicCategories, wantsCustom, wantsCommunity, shouldFetchPublic };
}
