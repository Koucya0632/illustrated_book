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
import type { Category, Definition, Example, Word } from "@/types";
import { toZhHans } from "./opencc";

/** Key shape inside `localizedTexts`: `"<field>|<language>"`. */
export type LocalizedTextMap = Record<string, string>;

/** UI languages whose glosses are stored per-language (not derived). */
type GlossLang = "ja" | "en";

function glossLang(lang: UiLang): GlossLang | null {
  return lang === "ja" || lang === "en" ? lang : null;
}

export function localizeWord(
  w: Word,
  lang: UiLang,
  localizedTexts?: LocalizedTextMap,
): Word {
  // Definitions always need filtering: the raw fetch returns every language
  // we have on file (zh + en + ja), so even the zh-Hant pass must drop the
  // foreign rows or the headline ends up "冰箱；冷蔵庫".
  const localizedDefs = pickDefinitions(w.definitions, lang);
  const chinese = localizedDefs[0]?.definition ?? localizeZhText(w.chinese, lang);

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
  // For ja/en the headline `chinese` already carries the gloss-language
  // definition; the zh explainer line would reintroduce Chinese.
  const chineseDefinition = glossLang(lang)
    ? undefined
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

/** Localize a Category's display name. `cat.nameZh` is the zh-Hant base;
 *  `cat.name` is the English name; ja names live in `translations`.
 *  Returns a new Category with `nameZh` set to the chosen language's name. */
export function localizeCategory(
  cat: Category,
  lang: UiLang,
  translations?: Record<string, string>,
): Category {
  if (lang === "ja") {
    const ja = translations?.ja;
    return ja ? { ...cat, nameZh: ja } : cat; // fall back to zh-Hant
  }
  if (lang === "en") {
    return cat.name ? { ...cat, nameZh: cat.name } : cat;
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
