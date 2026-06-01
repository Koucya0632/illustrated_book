// CategoryId is now just a string alias — categories live in the DB and can
// be extended without a TS change. The seed list still uses these 9 ids.
export type CategoryId = string;

export interface Category {
  id: CategoryId;
  name: string;
  nameZh: string;
  emoji: string;
  description: string;
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
  word: string;
  chinese: string;
  imageUrl: string;
  category: CategoryId;
  pronunciation: string;
}

export interface Word {
  id: string;
  word: string;
  alsoKnownAs?: string[];
  category: CategoryId;
  partOfSpeech: string;
  pronunciation: string;
  audioUrl?: string;
  imageUrl: string;
  cefrLevel?: CEFRLevel;
  status: WordStatus;

  /** Multi-language meanings. Always populated; in Phase 1 it's pre-filled
   *  with a single { language: 'zh', sortOrder: 0 } row. */
  definitions: Definition[];
  /** Convenience accessor: first zh definition's text. Backward-compatible
   *  with the pre-Phase-2 Word shape; new code should iterate `definitions`. */
  chinese: string;

  examples: Example[];
  /** Free-form tags (slug). Empty array when none. */
  tags: string[];
  /** Typed relations. Replaces the old `relatedWords` + `confusingWords`. */
  relations: WordRelation[];

  collocations?: string[];
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
