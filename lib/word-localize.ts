// Localize a Word / Category to the user's UI language.
//
// The source-of-truth content is zh-Hant (stored in `words.etymology`,
// `words.note`, `word_definitions(language='zh')`, `word_example_translations
// (language='zh')`, `categories.name_zh`). On top of that we overlay:
//   - `word_definitions(language='ja')` for word meanings.
//   - `word_example_translations(language='ja')` for example sentence
//     translations.
//   - `word_localized_texts(field, language='ja')` for etymology / note.
//   - `category_translations(language='ja')` for category display name.
//
// zh-Hans isn't stored at all; it's runtime-converted from zh-Hant via
// OpenCC. zh-Hant always passes through untouched.
//
// Fallback rule: requested lang → zh-Hant (opencc-converted if zh-Hans).

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

  if (lang === "zh-Hant") {
    // examples[].zh, etymology, note, forms[].label are all already the
    // zh-Hant base values — pass them through untouched.
    return { ...w, definitions: localizedDefs, chinese };
  }

  const examples: Example[] = w.examples.map((e) => ({
    ...e,
    zh: pickExampleZh(e, lang) ?? localizeZhText(e.zh, lang),
  }));

  const etymology = pickLocalizedText("etymology", w.etymology, lang, localizedTexts);
  const note = pickLocalizedText("note", w.note, lang, localizedTexts);
  const forms = w.forms?.map((f) => ({ ...f, label: localizeZhText(f.label, lang) }));

  return {
    ...w,
    chinese,
    definitions: localizedDefs,
    examples,
    etymology,
    note,
    forms,
  };
}

/** Localize a Category's display name. `cat.nameZh` is the zh-Hant base.
 *  Returns a new Category with `nameZh` set to the chosen language's name. */
export function localizeCategory(
  cat: Category,
  lang: UiLang,
  translations?: Record<string, string>,
): Category {
  if (lang === "zh-Hant") return cat;
  if (lang === "ja") {
    const ja = translations?.ja;
    if (ja) return { ...cat, nameZh: ja };
    // fall through to zh-Hant (no opencc for ja fallback)
    return cat;
  }
  // zh-Hans
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
  return text; // ja or zh-Hant — leave as-is (ja inline labels not translated)
}

function pickDefinitions(defs: Definition[], lang: UiLang): Definition[] {
  if (!defs?.length) return defs ?? [];

  if (lang === "ja") {
    const ja = defs.filter((d) => d.language === "ja");
    if (ja.length) return sortByOrder(ja);
  }

  const zh = defs.filter((d) => d.language === "zh");
  if (!zh.length) return sortByOrder(defs);

  if (lang === "zh-Hans") {
    return sortByOrder(zh).map((d) => ({ ...d, definition: toZhHans(d.definition) }));
  }
  return sortByOrder(zh);
}

function pickExampleZh(e: Example, lang: UiLang): string | undefined {
  if (lang === "ja") {
    const ja = e.translations?.ja;
    if (ja) return ja;
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
  if (lang === "ja") {
    const ja = localizedTexts?.[`${field}|ja`];
    if (ja) return ja;
  }
  if (!base) return undefined;
  if (lang === "zh-Hans") return toZhHans(base);
  return base;
}

function sortByOrder<T extends { sortOrder: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.sortOrder - b.sortOrder);
}
