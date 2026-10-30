import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import proposal from "../data/winter-checkout-2026-10-existing-bag-update.json";
import { primaryChinese, type Word } from "../types";
import { targetLanguageFor, type LearningDirection, type UiLang } from "../lib/settings";
import { localizeWord, localizeSpans, type LocalizedTextMap } from "../lib/word-localize";
import { spansCoverSentence, unlinkSelfReference } from "../lib/example-spans";
import { canStudyCard } from "../lib/study-membership";

// Extract the actual private DB-row adapter and detail function rather than
// duplicating their implementation or importing Next's cache/DB runtime.
const text = fs.readFileSync(new URL("../lib/data.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("data.ts", text, ts.ScriptTarget.Latest, true);
function actualFunctions(names: string[]) {
  const found = ast.statements.filter((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && !!node.name && names.includes(node.name.text));
  assert.equal(found.length, names.length);
  const source = found.map((node) => node.getText(ast).replace(/^export\s+/, "")).join("\n");
  return ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
}
const rowToWord = new Function("primaryChinese", actualFunctions(["parseJsonbColumn", "rowToWord"]) + "\nreturn rowToWord;")(primaryChinese) as
  (row: unknown) => { word: Word; localizedTexts: LocalizedTextMap };
const after = proposal.after;
const raw = rowToWord({
  ...after.word[0], definitions: after.definitions,
  examples: after.examples.map((example) => ({
    ...example,
    translations: Object.fromEntries(after.translations.filter((t) => t.example_id === example.id).map((t) => [t.language, t.translation])),
  })),
  localized_texts: Object.fromEntries(after.localizedTexts.map((t) => [`${t.field}|${t.language}`, t.value])),
  audio_by_locale: Object.fromEntries(after.wordMedia.filter((m) => m.kind === "audio").map((m) => [m.locale, m.url])),
  relations: [], tags: [],
});
const getLearningWord = new Function(
  "getAllRawEntries", "jaGlossTermMap", "localizeWord", "targetLanguageFor", "targetTermMap",
  "spansForSentences", "spansCoverSentence", "localizeSpans", "unlinkSelfReference",
  actualFunctions(["getLearningWord"]) + "\nreturn getLearningWord;",
)(
  async () => [raw],
  async () => new Map(after.terms.filter((t) => t.language === "ja").map((t) => [t.word_id, t])),
  localizeWord, targetLanguageFor,
  async (direction: LearningDirection) => new Map(after.terms.filter((t) => t.language === targetLanguageFor(direction)).map((t) => [t.word_id, t])),
  async () => new Map(), spansCoverSentence, localizeSpans, unlinkSelfReference,
) as (id: string, lang: UiLang, direction: LearningDirection) => Promise<Word>;

for (const lang of ["zh-Hant", "en", "ja"] as const) {
  for (const direction of ["zh-en", "zh-ja"] as const) {
    test(`actual row adapter/localizer/detail projects ${lang} usage note for ${direction}`, async () => {
      const detail = await getLearningWord("plastic-bag", lang, direction);
      const oldPrefix = lang === "zh-Hant" ? proposal.before.word[0].note : proposal.before.localizedTexts.find((t) => t.field === "note" && t.language === lang)!.value;
      assert.ok(detail.note?.startsWith(oldPrefix + "\n\n"));
      assert.ok(detail.note?.includes("レジ袋"));
      assert.equal(detail.note, lang === "zh-Hant" ? after.word[0].note : after.localizedTexts.find((t) => t.field === "note" && t.language === lang)!.value);
      assert.ok(detail.alsoKnownAs?.includes("レジ袋"));
      assert.equal(detail.category, "supermarket");
      assert.equal(detail.imageUrl, proposal.before.word[0].image_url);
      assert.equal(detail.audioUrl, proposal.before.word[0].audio_url);
      assert.equal(detail.word, direction === "zh-ja" ? "ビニール袋" : "plastic bag");
      assert.equal(canStudyCard({ policy: "v2", tier: "free" }, { source: "public", category: detail.category }), false);
    });
  }
}
