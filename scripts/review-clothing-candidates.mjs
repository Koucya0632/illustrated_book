import { readFileSync, writeFileSync } from "node:fs";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const entries = JSON.parse(readFileSync("data/clothing-series-2026-09.json", "utf8")).entries;
const spans = JSON.parse(readFileSync("data/example-spans-clothing-2026-09.json", "utf8"));
const schema = z.object({
  reviews: z.array(z.object({
    id: z.string(),
    verdict: z.enum(["pass", "fail", "uncertain"]),
    evidence: z.string(),
    reason: z.string(),
    issues: z.array(z.object({
      field: z.string(),
      problem: z.string(),
      expected: z.string(),
    })).optional(),
  })),
});
const cases = entries.flatMap(entry => [
  {
    id: entry.id,
    kind: "word",
    en: entry.word, ja: entry.ja, jaReading: entry.jaReading, zh: entry.chinese,
    definitions: entry.definitions, chineseDefinition: entry.chineseDefinition,
  },
  ...entry.examples.map((example, slot) => ({
    id: `${entry.id}:${slot}`, kind: "example", word: entry.word, jaTerm: entry.ja,
    cefrLevel: example.cefrLevel, text: example,
    englishSpans: spans.en[example.en].filter(({ z }) => z),
    japaneseSpans: spans.ja[example.ja].filter(({ z }) => z),
  })),
]);
const output = "output/clothing-publish-prep/semantic-ai-review.json";
const batches = Array.from({ length: Math.ceil(cases.length / 3) }, (_, index) => cases.slice(index * 3, index * 3 + 3));
const resume = process.argv.includes("--resume");
const results = resume ? JSON.parse(readFileSync(output, "utf8")).reviews : [];
for (const [index, batch] of batches.entries()) {
  if (index * 3 < results.length) continue;
  let object;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      ({ object } = await generateObject({
    model: openai("gpt-4.1"),
    schema,
    system: "You are an independent bilingual Japanese and Traditional Chinese editor reviewing proposed picture-dictionary content. Judge EVERY supplied item separately. For words, assess three-language concept alignment, Japanese reading, definition accuracy, and common Japanese daily-life terminology. For examples, assess plausible daily-life use, natural Japanese, three-language event alignment, and whether A2 or B1 matches the Japanese sentence. Inspect EVERY tappable English and Japanese span: contextual Chinese/Japanese/English gloss and full kana reading of each Japanese span. A structural pass does not mean semantic quality. For EACH item, supply evidence that is an exact substring of one displayed headword or sentence. The reason must discuss that evidence and one specific content judgment, NEVER a generic assurance that all fields or spans are fine. If any gloss is unnatural, wrong, or misleading, return fail with exact field and correction. If unsure, return uncertain. Always include issues: [] for passes.",
    prompt: JSON.stringify(batch),
      }));
      break;
    } catch (error) {
      if (attempt === 2) throw error;
      console.error(`retrying review batch ${index + 1}: ${error.message}`);
    }
  }
  if (object.reviews.length !== batch.length || object.reviews.some((r, i) => r.id !== batch[i].id)) {
    throw new Error(`batch ${index + 1} review IDs mismatch`);
  }
  for (const [i, review] of object.reviews.entries()) {
    const source = JSON.stringify(batch[i]);
    review.evidenceValid = Boolean(review.evidence && source.includes(review.evidence));
    review.reasonConcrete = review.reason.length >= 30;
    review.issues ??= [];
    if (review.verdict !== "pass" && review.issues.length === 0) review.reasonConcrete = false;
  }
  results.push(...object.reviews);
  writeFileSync(output, JSON.stringify({
    schemaVersion: 1,
    state: "independent-model-suggestions-pending-editorial-confirmation",
    source: "data/clothing-series-2026-09.json",
    reviewedCount: results.length,
    reviews: results,
  }, null, 2) + "\n");
  console.log(`reviewed ${results.length}/${cases.length}`);
}
