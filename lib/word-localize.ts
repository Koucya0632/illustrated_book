// Localize a Word / Category to the user's UI language.
//
// The source-of-truth content is zh-Hant (stored in `words.etymology`,
// `words.note`, `word_definitions(language='zh')`, `word_example_translations
// (language='zh')`, `categories.name_zh`). Gloss language follows the UI
// language:
//   - zh-Hant: pass the base through untouched.
//   - zh-Hans: runtime OpenCC conversion of the zh-Hant base (never stored).
//   - ja:  overlay `word_definitions(ja)`, `word_example_translations(ja)`,
//          `word_localized_texts(field, 'ja')`, `category_translations(ja)`.
//   - en:  overlay `word_definitions(en)`; the example gloss is the English
//          source sentence itself; etymology/note come from
//          `word_localized_texts(field, 'en')`; category name from
//          `categories.name`.
//
// Fallback rule: load-bearing fields (headline gloss, definitions) fall back
// to zh-Hant when the gloss language has no row; decorative fields
// (chineseDefinition, collocationsZh) are omitted for ja/en instead — a
// Chinese explainer line is noise for a reader who chose ja/en precisely
// because they can't read Chinese.

import type { UiLang } from "./settings";
import type {
  Category,
  Definition,
  Example,
  GlossSpan,
  GlossSpanRow,
  Word,
} from "@/types";
import { toZhHans } from "./opencc";

/** Key shape inside `localizedTexts`: `"<field>|<language>"`. */
export type LocalizedTextMap = Record<string, string>;

/** UI languages whose glosses are stored per-language (not derived). */
type GlossLang = "ja" | "en";

function glossLang(lang: UiLang): GlossLang | null {
  return lang === "ja" || lang === "en" ? lang : null;
}

/**
 * Pick one gloss language for a sentence's 詞塊.
 *
 * Lives here rather than beside the query so every gloss-language rule stays
 * in one file. It follows the same shape as the rest: zh-Hant is the stored
 * base, zh-Hans is an OpenCC conversion of it, ja and en are overlays.
 *
 * **The fallback is load-bearing.** A span whose requested language is missing
 * falls back to zh-Hant rather than losing its gloss, because losing the gloss
 * is losing the tap — and whether a word can be tapped must not depend on the
 * interface language, or the same sentence goes half-dead in 日本語 and reads
 * as a bug. A span with no gloss in *any* language is a function word, and
 * stays untappable by design.
 */
export function localizeSpans(spans: GlossSpanRow[], lang: UiLang): GlossSpan[] {
  return spans.map(({ glosses, ...rest }) => {
    const base = glosses["zh-Hant"];
    const picked = lang === "zh-Hans" ? undefined : (glosses[lang] ?? base);
    const gloss = lang === "zh-Hans" ? (base ? toZhHans(base) : undefined) : picked;
    return gloss ? { ...rest, gloss } : rest;
  });
}

/**
 * Localize one word.
 *
 * `glossTerm` is the short headword in the gloss language (`word_terms`), and
 * it is what makes a ja headline read 「バケツ」 rather than 「バケツ」は、液体を
 * 積み込んだり運ぶために使用される…: the stored ja *definition* is an explanatory
 * sentence by design (lib/translate.ts asks for one that "must not merely
 * repeat the term"), so it belongs on the explainer line the zh-Hant layout
 * gives 中文釋義 — never in the slot where zh prints 水桶. Callers that have no
 * term map pass nothing and get the old definition-as-headline behaviour,
 * which is still the right fallback for a word whose gloss language has a
 * definition but no headword.
 */
export function localizeWord(
  w: Word,
  lang: UiLang,
  localizedTexts?: LocalizedTextMap,
  glossTerm?: string,
): Word {
  // Definitions always need filtering: the raw fetch returns every language
  // we have on file (zh + en + ja), so even the zh-Hant pass must drop the
  // foreign rows or the headline ends up "冰箱；冷蔵庫".
  const localizedDefs = pickDefinitions(w.definitions, lang);
  const headword = glossLang(lang) ? glossTerm?.trim() : undefined;
  const glossDefinition = localizedDefs[0]?.definition;
  const chinese = headword || glossDefinition || localizeZhText(w.chinese, lang);

  // Collocations are stored EN-only on `words.collocations`; the zh-Hant
  // translation array is overlayed via word_localized_texts. ja/en UIs read
  // the EN chip list alone.
  const collocationsZh = pickCollocationsZh(lang, localizedTexts);

  if (lang === "zh-Hant") {
    // examples[].zh, etymology, note, forms[].label are all already the
    // zh-Hant base values — pass them through untouched.
    return { ...w, definitions: localizedDefs, chinese, collocationsZh };
  }

  const examples: Example[] = w.examples.map((e) => ({
    ...e,
    zh: pickExampleGloss(e, lang) ?? localizeZhText(e.zh, lang),
  }));

  const etymology = pickLocalizedText("etymology", w.etymology, lang, localizedTexts);
  const note = pickLocalizedText("note", w.note, lang, localizedTexts);
  // The explainer line under the headline. For zh it is the zh 釋義; for ja/en
  // the zh 釋義 would reintroduce Chinese, so the slot carries the gloss
  // language's own explanatory definition instead — but only once the headline
  // is a term, or the two lines would print the same sentence twice.
  const chineseDefinition = glossLang(lang)
    ? headword && glossDefinition !== headword
      ? glossDefinition
      : undefined
    : pickZhOnlyText(w.chineseDefinition, lang);
  const forms = w.forms?.map((f) => ({ ...f, label: localizeZhText(f.label, lang) }));

  return {
    ...w,
    chinese,
    definitions: localizedDefs,
    examples,
    etymology,
    note,
    chineseDefinition,
    forms,
    collocationsZh,
  };
}

function pickCollocationsZh(
  lang: UiLang,
  localizedTexts?: LocalizedTextMap,
): string[] | undefined {
  if (glossLang(lang)) return undefined; // zh-only data; EN chips still show
  const raw = localizedTexts?.["collocations|zh-Hant"];
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const zhHant = parsed.map(String);
  if (lang === "zh-Hans") return zhHant.map(toZhHans);
  return zhHant;
}

/** One language's overlay row for a category. `description` is nullable on its
 *  own: a category can have a translated name and no translated description. */
export interface CategoryTranslation {
  name: string;
  description?: string | null;
}

/** Localize a Category's display name **and description**. `cat.nameZh` /
 *  `cat.description` are the zh-Hant base, `cat.name` / `cat.descriptionEn` are
 *  English, and every other language is an overlay row in `translations`.
 *  Returns a new Category with `nameZh` and `description` set to the chosen
 *  language's text.
 *
 *  Each field falls back on its own. A category whose ja overlay has a name but
 *  no description shows the Japanese name over the zh-Hant description, which is
 *  what every category did for both fields until the description columns
 *  existed — a missing translation must never blank the line out. */
export function localizeCategory(
  cat: Category,
  lang: UiLang,
  translations?: Record<string, CategoryTranslation>,
): Category {
  if (lang === "ja") {
    const ja = translations?.ja;
    if (!ja) return cat; // fall back to zh-Hant for both fields
    return {
      ...cat,
      nameZh: ja.name || cat.nameZh,
      description: ja.description || cat.description,
    };
  }
  if (lang === "en") {
    return {
      ...cat,
      nameZh: cat.name || cat.nameZh,
      description: cat.descriptionEn || cat.description,
    };
  }
  if (lang !== "zh-Hans") return cat;
  return {
    ...cat,
    nameZh: toZhHans(cat.nameZh),
    description: cat.description ? toZhHans(cat.description) : cat.description,
  };
}

// ---- internals ----

function localizeZhText(text: string, lang: UiLang): string {
  if (!text) return text;
  if (lang === "zh-Hans") return toZhHans(text);
  return text; // zh-Hant base; also the ja/en fallback — leave as-is
}

/** zh-only decorative text: OpenCC for zh-Hans, untouched otherwise. */
function pickZhOnlyText(base: string | undefined, lang: UiLang): string | undefined {
  if (!base) return undefined;
  if (lang === "zh-Hans") return toZhHans(base);
  return base;
}

function pickDefinitions(defs: Definition[], lang: UiLang): Definition[] {
  if (!defs?.length) return defs ?? [];

  const g = glossLang(lang);
  if (g) {
    const rows = defs.filter((d) => d.language === g);
    if (rows.length) return sortByOrder(rows);
    // fall through to zh-Hant (load-bearing: better a Chinese gloss than none)
  }

  const zh = defs.filter((d) => d.language === "zh");
  if (!zh.length) return sortByOrder(defs);

  if (lang === "zh-Hans") {
    return sortByOrder(zh).map((d) => ({ ...d, definition: toZhHans(d.definition) }));
  }
  return sortByOrder(zh);
}

function pickExampleGloss(e: Example, lang: UiLang): string | undefined {
  if (lang === "ja") {
    const ja = e.translations?.ja;
    if (ja) return ja;
  }
  if (lang === "en") {
    // The English source sentence IS the English gloss (no en translation
    // rows exist or are needed). getLearningWord blanks it when it would
    // duplicate the displayed sentence (en UI × zh-en).
    if (e.en) return e.en;
  }
  const zh = e.translations?.zh ?? e.zh;
  if (!zh) return undefined;
  if (lang === "zh-Hans") return toZhHans(zh);
  return zh;
}

function pickLocalizedText(
  field: "etymology" | "note",
  base: string | undefined,
  lang: UiLang,
  localizedTexts?: LocalizedTextMap,
): string | undefined {
  const g = glossLang(lang);
  if (g) {
    const overlay = localizedTexts?.[`${field}|${g}`];
    if (overlay) return overlay;
    return base || undefined; // zh-Hant fallback until the apply script fills the gap
  }
  if (!base) return undefined;
  if (lang === "zh-Hans") return toZhHans(base);
  return base;
}

function sortByOrder<T extends { sortOrder: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.sortOrder - b.sortOrder);
}
