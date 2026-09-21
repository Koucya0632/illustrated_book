import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = ["a", "b"].map((batch) =>
  path.join(root, `data/convenience-store-series-2026-09-batch-${batch}.json`),
);
const documents = files.map((file) => JSON.parse(fs.readFileSync(file, "utf8")));
const entries = documents.flatMap((document) => document.entries ?? []);
const issues = [];

const fail = (scope, message) => issues.push(`${scope}: ${message}`);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const ids = new Set(entries.map(({ id }) => id));

for (const [index, document] of documents.entries()) {
  const scope = path.basename(files[index]);
  if (document.schemaVersion !== 1) fail(scope, "schemaVersion must be 1");
  if (document.series !== "convenience-store") fail(scope, "series mismatch");
  if (document.state !== "candidate-content-reviewed-media-pending") {
    fail(scope, "unexpected candidate state");
  }
  if (!Array.isArray(document.entries)) fail(scope, "entries must be an array");
}

if (entries.length !== 34) fail("series", `expected 34 entries, received ${entries.length}`);
if (ids.size !== entries.length) fail("series", "word ids must be unique");

const words = new Set();
const englishExamples = new Set();
const japaneseExamples = new Set();
for (const entry of entries) {
  const scope = entry.id ?? "entry-without-id";
  for (const field of [
    "id",
    "word",
    "chinese",
    "chineseDefinition",
    "category",
    "partOfSpeech",
    "pronunciation",
    "ja",
    "jaReading",
  ]) {
    if (!nonEmpty(entry[field])) fail(scope, `${field} must be non-empty`);
  }
  if (entry.category !== "convenience-store") fail(scope, "category mismatch");
  if (entry.partOfSpeech !== "noun") fail(scope, "partOfSpeech must be noun");
  if (!/^\/.+\/$/.test(entry.pronunciation ?? "")) fail(scope, "pronunciation must be slash-delimited IPA");

  const normalizedWord = entry.word?.trim().toLowerCase();
  if (words.has(normalizedWord)) fail(scope, "English headword is duplicated");
  words.add(normalizedWord);

  const definitions = Array.isArray(entry.definitions) ? entry.definitions : [];
  const languages = definitions.map(({ language }) => language).sort().join(",");
  if (languages !== "en,ja,zh") fail(scope, "definitions must contain exactly en, ja, and zh");
  for (const definition of definitions) {
    if (!nonEmpty(definition.definition)) fail(scope, `${definition.language} definition is empty`);
    if (definition.sortOrder !== 0) fail(scope, `${definition.language} definition sortOrder must be 0`);
  }

  const examples = Array.isArray(entry.examples) ? entry.examples : [];
  if (examples.length !== 2) fail(scope, `expected 2 examples, received ${examples.length}`);
  if (examples[0]?.cefrLevel !== "A2" || examples[1]?.cefrLevel !== "B1") {
    fail(scope, "examples must be ordered A2 then B1");
  }
  for (const [exampleIndex, example] of examples.entries()) {
    for (const language of ["en", "ja", "zh"]) {
      if (!nonEmpty(example?.[language])) fail(scope, `example ${exampleIndex + 1} ${language} is empty`);
    }
    if (englishExamples.has(example?.en)) fail(scope, `duplicate English example: ${example?.en}`);
    if (japaneseExamples.has(example?.ja)) fail(scope, `duplicate Japanese example: ${example?.ja}`);
    englishExamples.add(example?.en);
    japaneseExamples.add(example?.ja);
  }
  if (examples[0]?.en === examples[1]?.en || examples[0]?.ja === examples[1]?.ja) {
    fail(scope, "the two examples must be distinct");
  }

  const related = Array.isArray(entry.relatedWords) ? entry.relatedWords : [];
  if (related.length !== 3 || new Set(related).size !== 3) {
    fail(scope, "relatedWords must contain exactly 3 distinct ids");
  }
  for (const relatedId of related) {
    if (!ids.has(relatedId)) fail(scope, `related word is outside this series: ${relatedId}`);
    if (relatedId === entry.id) fail(scope, "relatedWords must not include the entry itself");
  }

  if (entry.jaReadingSegments !== null) {
    if (!Array.isArray(entry.jaReadingSegments) || entry.jaReadingSegments.length === 0) {
      fail(scope, "jaReadingSegments must be null or a non-empty array");
    } else {
      const reconstructed = entry.jaReadingSegments.map(({ text }) => text).join("");
      if (reconstructed !== entry.ja) fail(scope, "jaReadingSegments do not reconstruct ja");
      for (const [segmentIndex, segment] of entry.jaReadingSegments.entries()) {
        if (!nonEmpty(segment.text)) fail(scope, `Japanese segment ${segmentIndex + 1} has empty text`);
        if (segment.ruby !== null && !nonEmpty(segment.ruby)) {
          fail(scope, `Japanese segment ${segmentIndex + 1} has invalid ruby`);
        }
      }
    }
  }

  if (entry.id === "convenience-store") {
    if (entry.imageUrl !== "https://img.nexflow.team/word-images/convenience-store.webp") {
      fail(scope, "existing catalog image URL must be preserved");
    }
  } else if (entry.imageUrl !== null && !/^https:\/\/img\.nexflow\.team\/word-images\/.+\.webp$/.test(entry.imageUrl)) {
    fail(scope, "imageUrl must be null or a versioned word-images WebP URL");
  }
}

if (englishExamples.size !== 68) fail("series", `expected 68 unique English examples, received ${englishExamples.size}`);
if (japaneseExamples.size !== 68) fail("series", `expected 68 unique Japanese examples, received ${japaneseExamples.size}`);

if (issues.length > 0) {
  console.error(issues.join("\n"));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    series: "convenience-store",
    entries: entries.length,
    newEntries: entries.filter(({ id }) => id !== "convenience-store").length,
    examples: englishExamples.size,
    status: "valid",
  }, null, 2));
}
