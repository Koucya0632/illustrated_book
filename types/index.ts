// The furigana segment shape is defined beside the rules that produce it, and
// re-exported here so a consumer of the word types needs only one import.
export type { FuriganaSegment } from "../lib/kana";
import type { FuriganaSegment } from "../lib/kana";

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

/** One tappable (or untappable) unit of an annotated example sentence — 詞塊.
 *
 *  Not "one word": `look forward to` is a single span, because to a learner it
 *  is one unit and glossing the bare `to` inside it is wrong rather than
 *  merely useless.
 *
 *  A span is tappable exactly when it has a gloss. There is no separate flag,
 *  and the answer must not vary by interface language — see `glosses`. */
export interface GlossSpan {
  /** This span's slice of the sentence, verbatim, including whatever spaces
   *  and punctuation belong to it. The spans of one sentence concatenate back
   *  into it exactly; a set that does not is discarded whole. */
  text: string;
  /** The meaning *in this sentence*, in the requested UI language. Filled by
   *  `localizeWord`; absent on function words and punctuation, which is what
   *  makes them untappable. */
  gloss?: string;
  /** `running` → `run`. Absent when the span is already its own base form.
   *  Deliberately not called `lemma`: that name is taken by the 自製圖鑑 item
   *  headword (`atlas_items.lemma`). */
  baseForm?: string;
  /** Canonical English part of speech, as iOS `localizedPartOfSpeech` expects. */
  partOfSpeech?: string;
  /** Kana reading. Japanese sentences only. */
  reading?: string;
  /** The catalogue word this span teaches, when it is one — lets the client
   *  offer a way into the word's own entry. Resolved by the annotation script
   *  against the catalogue, never by the model. */
  wordId?: string;
  /** IPA for English, a copy of the kana reading for Japanese — the catalogue's
   *  own `word_terms.pronunciation`, never authored per span and never produced
   *  by a model.
   *
   *  Present only when the span **is spelled exactly like the headword it links
   *  to**, which is a stricter test than `wordId`. `wordId` is resolved from the
   *  span's *base form*, so `documents` links to `document` and `next corner` to
   *  `corner`; printing the headword's transcription under an inflection or a
   *  longer phrase would be teaching the wrong pronunciation. That gate is here
   *  rather than on the client because it is a fact about the catalogue, and the
   *  client holds no dictionary (ADR-0009). Roughly one tappable span in five
   *  qualifies; the rest simply have no line, the same way they have no 書籤. */
  pronunciation?: string;
}

/** A 詞塊 as stored: every gloss language, none picked yet.
 *
 *  Never leaves the server. `localizeSpans` turns a list of these into
 *  `GlossSpan[]` for one UI language, so the wire carries the one language
 *  `?lang=` asked for rather than all three. */
export interface GlossSpanRow extends Omit<GlossSpan, "gloss"> {
  /** Keyed by UI language: 'zh-Hant' (the source of truth), 'ja', 'en'.
   *  zh-Hans is never stored — OpenCC derives it at request time. */
  glosses: Record<string, string>;
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
  /** 詞塊 covering the sentence actually being served — i.e. `target`, which
   *  for a 日文 learner is the Japanese translation and not `en`. Absent for
   *  anything the annotation backfill has not reached, which is normal and
   *  renders as the plain sentence. */
  spans?: GlossSpan[];
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
  /** Which kana sit over which characters of `word`, when a trustworthy split
   *  exists. Segments re-spell `word` and their ruby re-spells `reading`, so a
   *  client can render either from this alone. Absent means "print the reading
   *  as its own line" — the pre-furigana behaviour. */
  readingSegments?: FuriganaSegment[];
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
  /** Which kana sit over which characters of `word`, when a trustworthy split
   *  exists. Segments re-spell `word` and their ruby re-spells `reading`, so a
   *  client can render either from this alone. Absent means "print the reading
   *  as its own line" — the pre-furigana behaviour. */
  readingSegments?: FuriganaSegment[];
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
  /** 詞塊 for `targetDefinition` — the 譯義 line is a sentence in the language
   *  being learned, so it is tappable on the same terms an example is. The
   *  Chinese explainer beside it is not: glossing Chinese for a Chinese reader
   *  teaches nothing, and ja/en interfaces never see that line at all. */
  targetDefinitionSpans?: GlossSpan[];
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
