// Localize a Word / Category to the user's UI language.
//
// The source-of-truth content is zh-Hant (stored in `words.etymology`,
// `words.note`, `word_definitions(language='zh')`, `word_example_translations
// (language='zh')`, `categories.name_zh`).
//
// zh-Hans isn't stored at all; it's runtime-converted from zh-Hant via
// OpenCC. Every other uiLang (zh-Hant, and the ja/en interface languages)
// passes the zh-Hant base through untouched — ja/en localize app chrome
// only, not study content.
//
// (The retired ja *content* overlay used to surface `language='ja'` rows
// here; that path was removed. The ja content rows still live in the DB but
// are no longer surfaced.)

import type { UiLang } from "./settings";
import type { Category, Definition, Example, Word } from "@/types";
import { toZhHans } from "./opencc";

/** Key shape inside `localizedTexts`: `"<field>|<language>"`. */
export type LocalizedTextMap = Record<string, string>;

export function localizeWord(
  w: Word,
  lang: UiLang,
  localizedTexts?: LocalizedTextMap,
): Word {
  // Definitions always need filtering: the raw fetch returns every language
  // we have on file (zh + ja today), so even the zh-Hant pass must drop the
  // ja rows or the headline ends up "冰箱；冷蔵庫".
  const localizedDefs = pickDefinitions(w.definitions, lang);
  const chinese = localizedDefs[0]?.definition ?? localizeZhText(w.chinese, lang);

  // Collocations are stored EN-only on `words.collocations`; the zh-Hant
  // translation array is overlayed via word_localized_texts. Apply it on
  // every lang pass (the EN list stays in `w.collocations`).
  const collocationsZh = pickCollocationsZh(lang, localizedTexts);

  if (lang !== "zh-Hans") {
    // zh-Hant (and ja/en, which read the zh-Hant base): examples[].zh,
    // etymology, note, forms[].label are all already the base values —
    // pass them through untouched.
    return { ...w, definitions: localizedDefs, chinese, collocationsZh };
  }

  const examples: Example[] = w.examples.map((e) => ({
    ...e,
    zh: pickExampleZh(e, lang) ?? localizeZhText(e.zh, lang),
  }));

  const etymology = pickLocalizedText(w.etymology, lang);
  const note = pickLocalizedText(w.note, lang);
  const chineseDefinition = pickLocalizedText(w.chineseDefinition, lang);
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

/** Localize a Category's display name. `cat.nameZh` is the zh-Hant base.
 *  Returns a new Category with `nameZh` set to the chosen language's name. */
export function localizeCategory(cat: Category, lang: UiLang): Category {
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
  return text; // zh-Hant — leave as-is
}

function pickDefinitions(defs: Definition[], lang: UiLang): Definition[] {
  if (!defs?.length) return defs ?? [];

  const zh = defs.filter((d) => d.language === "zh");
  if (!zh.length) return sortByOrder(defs);

  if (lang === "zh-Hans") {
    return sortByOrder(zh).map((d) => ({ ...d, definition: toZhHans(d.definition) }));
  }
  return sortByOrder(zh);
}

function pickExampleZh(e: Example, lang: UiLang): string | undefined {
  const zh = e.translations?.zh ?? e.zh;
  if (!zh) return undefined;
  if (lang === "zh-Hans") return toZhHans(zh);
  return zh;
}

function pickLocalizedText(
  base: string | undefined,
  lang: UiLang,
): string | undefined {
  if (!base) return undefined;
  if (lang === "zh-Hans") return toZhHans(base);
  return base;
}

function sortByOrder<T extends { sortOrder: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.sortOrder - b.sortOrder);
}
