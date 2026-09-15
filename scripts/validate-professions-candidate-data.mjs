import fs from "node:fs";
import process from "node:process";

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function kanaOnly(value) {
  return /^[\u3040-\u30ffー・\s]+$/u.test(value);
}

function validateReadingSegments(entry, issues) {
  if (entry.jaReadingSegments === null) {
    if (!kanaOnly(entry.ja)) {
      issues.push(`${entry.id}: kanji headword requires jaReadingSegments`);
    }
    return;
  }
  if (!Array.isArray(entry.jaReadingSegments) || entry.jaReadingSegments.length === 0) {
    issues.push(`${entry.id}: jaReadingSegments must be a non-empty array or null`);
    return;
  }
  const text = entry.jaReadingSegments.map((segment) => segment?.text ?? "").join("");
  const reading = entry.jaReadingSegments
    .map((segment) => segment?.ruby ?? segment?.text ?? "")
    .join("");
  if (text !== entry.ja) issues.push(`${entry.id}: reading segments do not rebuild ja`);
  if (reading !== entry.jaReading) issues.push(`${entry.id}: reading segments do not rebuild jaReading`);
}

function validateSpans(sentence, spans, language, issues) {
  if (!Array.isArray(spans) || spans.length === 0) {
    issues.push(`${language}: missing spans for ${JSON.stringify(sentence)}`);
    return;
  }
  if (spans.map((span) => span?.t ?? "").join("") !== sentence) {
    issues.push(`${language}: spans do not reconstruct ${JSON.stringify(sentence)}`);
  }
  let tappable = 0;
  for (const [index, span] of spans.entries()) {
    if (typeof span?.t !== "string" || span.t.length === 0) {
      issues.push(`${language}: empty span ${index} in ${JSON.stringify(sentence)}`);
      continue;
    }
    const glossKeys = ["z", "j", "e"];
    const glossCount = glossKeys.filter((key) => isText(span[key])).length;
    if (glossCount !== 0 && glossCount !== 3) {
      issues.push(`${language}: partial gloss at span ${index} in ${JSON.stringify(sentence)}`);
      continue;
    }
    if (glossCount === 3) {
      tappable += 1;
      if (/^[\p{P}\p{S}\s]+$/u.test(span.t)) {
        issues.push(`${language}: punctuation-only span is tappable in ${JSON.stringify(sentence)}`);
      }
      if (language === "ja") {
        if (!isText(span.r) || !kanaOnly(span.r)) {
          issues.push(`ja: tappable span ${JSON.stringify(span.t)} needs a kana reading`);
        }
      } else if (span.r !== undefined) {
        issues.push(`en: span ${JSON.stringify(span.t)} must not have a Japanese reading`);
      }
    } else if (Object.keys(span).some((key) => key !== "t")) {
      issues.push(`${language}: untappable span ${index} has annotation fields in ${JSON.stringify(sentence)}`);
    }
  }
  if (tappable < 2 || tappable > 8) {
    issues.push(`${language}: ${JSON.stringify(sentence)} has ${tappable} tappable units; expected 2-8`);
  }
}

const draftFile = argument("--draft");
const entriesFile = argument("--entries");
const spansFile = argument("--spans");
const expectedCount = Number(argument("--expected-count", "0"));
if (!draftFile && (!entriesFile || !spansFile)) {
  console.error(
    "Usage: node scripts/validate-professions-candidate-data.mjs (--draft <file> | --entries <file> --spans <file>) [--expected-count <n>]",
  );
  process.exit(2);
}

const entriesDocument = readJson(draftFile ?? entriesFile);
const spansDocument = draftFile ? entriesDocument.spans : readJson(spansFile);
const entries = entriesDocument.entries;
const issues = [];
if (!Array.isArray(entries)) issues.push("entries must be an array");
if (expectedCount && entries?.length !== expectedCount) {
  issues.push(`entry count ${entries?.length ?? 0}; expected ${expectedCount}`);
}

const ids = new Set();
const words = new Set();
const expectedSentences = { en: new Set(), ja: new Set() };
for (const entry of entries ?? []) {
  for (const field of ["id", "word", "chinese", "chineseDefinition", "pronunciation", "ja", "jaReading"]) {
    if (!isText(entry[field])) issues.push(`${entry.id ?? "unknown"}: missing ${field}`);
  }
  if (ids.has(entry.id)) issues.push(`${entry.id}: duplicate id`);
  if (words.has(entry.word)) issues.push(`${entry.id}: duplicate English headword`);
  ids.add(entry.id);
  words.add(entry.word);
  if (entry.category !== "professions") issues.push(`${entry.id}: category must be professions`);
  if (entry.partOfSpeech !== "noun") issues.push(`${entry.id}: partOfSpeech must be noun`);
  if (!/^\/.+\/$/u.test(entry.pronunciation ?? "")) {
    issues.push(`${entry.id}: pronunciation must be slash-delimited IPA`);
  }
  if (!Array.isArray(entry.relatedWords) || entry.relatedWords.length !== 3 || new Set(entry.relatedWords).size !== 3) {
    issues.push(`${entry.id}: relatedWords must contain three unique IDs`);
  } else if (entry.relatedWords.includes(entry.id)) {
    issues.push(`${entry.id}: relatedWords must not include the entry itself`);
  }
  const definitions = Array.isArray(entry.definitions) ? entry.definitions : [];
  const languages = definitions.map((definition) => definition.language).sort().join(",");
  if (definitions.length !== 3 || languages !== "en,ja,zh") {
    issues.push(`${entry.id}: definitions must contain one en, ja, and zh item`);
  }
  for (const definition of definitions) {
    if (!isText(definition.definition) || definition.sortOrder !== 0) {
      issues.push(`${entry.id}: invalid ${definition.language ?? "unknown"} definition`);
    }
  }
  validateReadingSegments(entry, issues);
  const examples = Array.isArray(entry.examples) ? entry.examples : [];
  if (examples.length !== 2) {
    issues.push(`${entry.id}: expected exactly two examples`);
    continue;
  }
  if (!new Set(["A1", "A2"]).has(examples[0].cefrLevel)) issues.push(`${entry.id}: first example must be A1-A2`);
  if (!new Set(["B1", "B2"]).has(examples[1].cefrLevel)) issues.push(`${entry.id}: second example must be B1-B2`);
  if (examples[0].en === examples[1].en || examples[0].ja === examples[1].ja) {
    issues.push(`${entry.id}: examples must not duplicate each other`);
  }
  for (const example of examples) {
    for (const language of ["en", "ja", "zh"]) {
      if (!isText(example[language])) issues.push(`${entry.id}: example missing ${language}`);
    }
    if (isText(example.en)) expectedSentences.en.add(example.en);
    if (isText(example.ja)) expectedSentences.ja.add(example.ja);
  }
}

for (const language of ["en", "ja"]) {
  const actual = spansDocument[language] ?? {};
  for (const sentence of expectedSentences[language]) {
    validateSpans(sentence, actual[sentence], language, issues);
  }
  for (const sentence of Object.keys(actual)) {
    if (!expectedSentences[language].has(sentence)) {
      issues.push(`${language}: unexpected span sentence ${JSON.stringify(sentence)}`);
    }
  }
}

const summary = {
  status: issues.length === 0 ? "passed" : "failed",
  entries: entries?.length ?? 0,
  uniqueIds: ids.size,
  examples: (entries?.length ?? 0) * 2,
  englishSpanSentences: Object.keys(spansDocument.en ?? {}).length,
  japaneseSpanSentences: Object.keys(spansDocument.ja ?? {}).length,
  issues,
};
console.log(JSON.stringify(summary, null, 2));
if (issues.length > 0) process.exit(1);
