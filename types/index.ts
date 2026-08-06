// CategoryId is now just a string alias — categories live in the DB and can
// be extended without a TS change. The seed list still uses these 9 ids.
export type CategoryId = string;

export interface Category {
  id: CategoryId;
  /** English display name. The base table carries zh-Hant and English; every
   *  other language is an overlay row in `category_translations`. */
  name: string;
  nameZh: string;
  emoji: string;
  description: string;
  /** English description, alongside `name` for the same reason. Optional so a
   *  category without one falls back to the zh-Hant `description`, which is
   *  what every category did before these existed. */
  descriptionEn?: string;
  color: string;
  imageUrl: string;
}

export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export type WordStatus = "draft" | "published" | "archived";

export type RelationType =
  | "synonym"
  | "antonym"
  | "hypernym"
  | "hyponym"
  | "confusing"
  | "see-also";

export interface Definition {
  language: string; // ISO 639-1 ("zh", "ja", "en", ...)
  definition: string;
  cefrLevel?: CEFRLevel;
  sortOrder: number;
}

export interface Example {
  /** English source sentence. */
  en: string;
  /** Sentence in the active learning target language. Detail views render
   *  this as the primary line; missing means it is not ready for that mode. */
  target?: string;
  /** Convenience: zh translation (= translations.zh). Kept for legacy UI;
   *  new code should read `translations[lang]` directly. */
  zh: string;
  /** Multilingual translations keyed by ISO 639-1 language code. */
  translations: Record<string, string>;
  cefrLevel?: CEFRLevel;
  sortOrder: number;
}

export interface WordRelation {
  wordId: string;
  type: RelationType;
  note?: string;
}

/** Legacy shape: `{ word, note }`. Phase 2c will phase this out in the UI
 *  in favor of `WordRelation` with `type='confusing'`. */
export interface ConfusingWord {
  word: string;
  note: string;
}

/** Lite shape passed through WordsProvider — covers the fields every
 *  list-style consumer (CardsBrowser / SearchClient / FavoritesClient /
 *  ProgressClient / WordCard) reads. Heavy fields (definitions, examples,
 *  relations, etymology, note, forms, tags, alsoKnownAs) live on the full
 *  Word and are only fetched by the per-word server pages. */
export interface CardWord {
  id: string;
  /** Target-language headword (English or Japanese depending on settings). */
  word: string;
  chinese: string;
  imageUrl: string;
  category: CategoryId;
  pronunciation: string;
  reading?: string;
  targetLanguage?: "en" | "ja";
  /** Pre-generated pronunciation clips keyed by locale (e.g. "en-US",
   *  "en-GB", "ja-JP"). Only the locales relevant to the active learning
   *  direction are included; absent when no audio has been generated. */
  audioUrls?: Record<string, string>;
}

export interface Word {
  id: string;
  word: string;
  alsoKnownAs?: string[];
  category: CategoryId;
  partOfSpeech: string;
  pronunciation: string;
  reading?: string;
  targetLanguage?: "en" | "ja";
  audioUrl?: string;
  /** Pre-generated pronunciation clips keyed by locale ("en-US" / "en-GB" /
   *  "ja-JP"). Superset of `audioUrl` (which mirrors the en-US clip). */
  audioUrls?: Record<string, string>;
  imageUrl: string;
  cefrLevel?: CEFRLevel;
  status: WordStatus;

  /** Multi-language meanings. Always populated; in Phase 1 it's pre-filled
   *  with a single { language: 'zh', sortOrder: 0 } row. */
  definitions: Definition[];
  /** Convenience accessor: first zh definition's text. Backward-compatible
   *  with the pre-Phase-2 Word shape; new code should iterate `definitions`. */
  chinese: string;
  /** Convenience accessor: first en definition's text. Shown verbatim on the
   *  word page under the zh headline, regardless of UI language. */
  englishDefinition?: string;
  /** Definition in the active learning target language (`en` or `ja`). */
  targetDefinition?: string;
  /** Sentence-form Chinese definition stored in `words.chinese_definition`
   *  (zh-Hant base; localized to UI lang via word_localize). */
  chineseDefinition?: string;

  examples: Example[];
  /** Free-form tags (slug). Empty array when none. */
  tags: string[];
  /** Typed relations. Replaces the old `relatedWords` + `confusingWords`. */
  relations: WordRelation[];

  collocations?: string[];
  /** Per-collocation zh-Hant translations parallel to `collocations`. Sourced
   *  from `word_localized_texts(field='collocations', language='zh-Hant')`
   *  storing a JSON-encoded array. Localized by UI lang (zh-Hans via opencc;
   *  ja currently absent, so undefined for ja). */
  collocationsZh?: string[];
  note?: string;
  /** Short etymology / word-formation breakdown (zh-Hant content). */
  etymology?: string;
  /** Inflected forms (plural, tenses, comparative…). label is zh-Hant content. */
  forms?: { label: string; value: string }[];

  /** @deprecated read `relations.filter(r => r.type === 'see-also')` instead. */
  relatedWords?: string[];
  /** @deprecated read `relations.filter(r => r.type === 'confusing')` instead. */
  confusingWords?: ConfusingWord[];
}

/** Pick the primary Chinese definition from a list of multi-language defs. */
export function primaryChinese(defs: Definition[]): string {
  const zh = defs
    .filter((d) => d.language === "zh")
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];
  return zh?.definition ?? "";
}

export interface Progress {
  learnedIds: string[];
  favoriteIds: string[];
  lastCategoryVisited?: CategoryId;
}
