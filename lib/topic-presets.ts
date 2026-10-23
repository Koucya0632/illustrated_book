// 主題組合 (topic presets) — a named group of public themes for one way of
// being in Japan, offered to someone who does not know what to study. Choosing
// one re-ticks the account's 學習主題 in one go; the account never records
// which preset it came from (tuji-ios CONTEXT.md, ADR-0020).
//
// Code, not a table: three short lists that only a developer edits, and every
// new table synced by migrate.ts is one more way for production to drift
// ahead of a deploy. Served inside /api/categories so a client gets them in
// the same request as the themes they name, localized the same way.
//
// Which themes are *free* is a pricing decision kept in study-membership.ts.
// Today it happens to contain all of 留學生 — a test holds that, rather than
// deriving one list from the other, so re-curating a preset can never quietly
// change what is free.

import { toZhHans } from "./opencc";
import type { UiLang } from "./settings";

export interface TopicPreset {
  id: string;
  /** zh-Hant base; zh-Hans is converted at read time like every other name. */
  name: string;
  nameJa: string;
  nameEn: string;
  categoryIds: readonly string[];
  /** The 學習主題 a brand-new account starts from. Exactly one preset has it. */
  isDefault: boolean;
}

/** What a client receives: one name, in the request's language. */
export interface LocalizedTopicPreset {
  id: string;
  name: string;
  categoryIds: string[];
  isDefault: boolean;
}

export const TOPIC_PRESETS: readonly TopicPreset[] = [
  {
    id: "student",
    name: "留學生",
    nameJa: "留学生",
    nameEn: "Student",
    categoryIds: ["campus", "identity-documents", "bank", "postal-services", "station-commuting", "convenience-store"],
    isDefault: true,
  },
  {
    id: "working-holiday",
    name: "打工度假",
    nameJa: "ワーキングホリデー",
    nameEn: "Working holiday",
    categoryIds: ["identity-documents", "bank", "restaurant", "convenience-store", "station-commuting", "supermarket"],
    isDefault: false,
  },
  {
    id: "travel",
    name: "旅遊",
    nameJa: "旅行",
    nameEn: "Travel",
    categoryIds: ["transportation", "convenience-store", "restaurant", "onsen-ryokan", "festivals", "cherry-blossom-season"],
    isDefault: false,
  },
];

function presetName(p: TopicPreset, lang: UiLang): string {
  switch (lang) {
    case "ja":
      return p.nameJa;
    case "en":
      return p.nameEn;
    case "zh-Hans":
      return toZhHans(p.name);
    default:
      return p.name;
  }
}

/**
 * The presets as a client should see them: named in `lang`, and naming only
 * themes that are actually served (`servedCategoryIds`) — a theme still
 * guarded or unpublished must not be ticked out of nowhere. A preset left
 * with no themes is dropped.
 */
export function localizeTopicPresets(
  lang: UiLang,
  servedCategoryIds: ReadonlySet<string>,
  presets: readonly TopicPreset[] = TOPIC_PRESETS,
): LocalizedTopicPreset[] {
  return presets.flatMap((p) => {
    const categoryIds = p.categoryIds.filter((id) => servedCategoryIds.has(id));
    if (categoryIds.length === 0) return [];
    return [{ id: p.id, name: presetName(p, lang), categoryIds, isDefault: p.isDefault }];
  });
}
