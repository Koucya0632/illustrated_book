// Generate the tappable three-language gloss spans that must ship with every
// main-catalog English/Japanese example sentence. Dry by default; --apply
// writes only data/example-spans.json. Loading database rows remains a
// separate, explicitly write-enabled step.
//
//   npm run examples:spans
//   npm run examples:spans -- --category=bathroom --apply
//   npm run examples:spans -- --word-id=access-card --refresh --apply
//
// --out= redirects the write so a run can be reviewed before it touches the corpus,
// --word-ids= takes a comma-separated set, and --attempt-log= records one JSONL row per
// model attempt so a run's first-pass yield can be measured instead of only warned about.

import { appendFileSync, renameSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  alignAuthoredSpans,
  containsGeneratedMetaGloss,
  type AuthoredSpan,
  type ExampleSpanCorpus,
  EXAMPLE_SPAN_PARTS_OF_SPEECH,
  isStandaloneGrammarSpan,
  MIN_LEARNING_SPANS,
  MAX_LEARNING_SPANS,
  loadExampleSpanCorpus,
  type SentenceLanguage,
  validateAuthoredSentence,
} from "../lib/example-span-corpus";
import { MAIN_WORD_EXAMPLE_PAIRS } from "../lib/main-word-example-pairs";
import { words } from "../lib/words";

type Candidate = {
  key: string;
  wordId: string;
  sortOrder: number;
  language: SentenceLanguage;
  sentence: string;
};

type GeneratedSpan = {
  t: string;
  z: string;
  j: string;
  e: string;
  b: string | null;
  p: string | null;
  r: string | null;
};

type ResponsesPayload = {
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
};

const MODEL = process.env.EXAMPLE_SPANS_MODEL?.trim() || "gpt-4.1-mini";

// Annotating a fixed sentence against a strict schema has one right answer, so there is
// nothing for sampling to explore on the first attempt — it only adds noise. Left unset,
// the API defaults to 1.0, and three runs of an identical 160-sentence slice returned
// first-pass yields of 88.1%, 78.8% and 83.8%: a 9.4 point spread on unchanged input,
// wider than any prompt change worth making.
//
// The first attempt is therefore deterministic. Retries are not, and cannot be: retrying
// a deterministic function with identical input returns the identical rejection. Setting
// this to 0 without the escalation in nextTemperature below makes the generator repeat
// one wrong answer until it exhausts its retries and fails the whole run — observed on
// intersection:0:ja, twenty identical rejections in a row.
//
// Measured over three runs of the same 160-sentence slice, against the same three at the
// API default of 1.0:
//
//                      temperature 1.0      0 with escalating retries
//   first-pass yield   83.5% mean           87.9% mean
//   run-to-run spread  9.4 points           3.1 points
//   requests per run   57                   75
//
// Better output and a third of the noise, for about 15% more requests — the retries that
// do happen now cost more, because they start from a first attempt that no longer varies.
const TEMPERATURE = (() => {
  const raw = process.env.EXAMPLE_SPANS_TEMPERATURE?.trim();
  if (!raw) return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 2) {
    throw new Error("EXAMPLE_SPANS_TEMPERATURE must be a number between 0 and 2");
  }
  return value;
})();
const OUTPUT_PATH = new URL("../data/example-spans.json", import.meta.url);

// Set from --attempt-log. Every accept and every rejection is appended here, so the
// share of sentences the model gets right without a retry stops being a console warning
// that scrolls past and becomes a number a baseline can hold.
let attemptLogPath: string | null = null;

function logAttempt(record: {
  key?: string;
  accepted?: boolean;
  batchSize: number;
  temperature?: number;
  issues?: string;
  usage?: unknown;
}): void {
  if (!attemptLogPath) return;
  appendFileSync(attemptLogPath, `${JSON.stringify({ ...record, at: Date.now() })}\n`, "utf8");
}

function valueFor(argv: string[], name: string): string | null {
  const value = argv.find((arg) => arg.startsWith(`${name}=`));
  return value?.slice(name.length + 1).trim() || null;
}

function parsePositiveInteger(argv: string[], name: string, fallback: number): number {
  const raw = valueFor(argv, name);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function candidatesFor(argv: string[], corpus: ExampleSpanCorpus): Candidate[] {
  const category = valueFor(argv, "--category");
  const wordId = valueFor(argv, "--word-id");
  const wordIds = valueFor(argv, "--word-ids")
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const languageFilter = valueFor(argv, "--language");
  if (languageFilter && languageFilter !== "en" && languageFilter !== "ja") {
    throw new Error("--language must be en or ja");
  }
  const refresh = argv.includes("--refresh");
  const invalidOnly = argv.includes("--invalid-only");
  if (invalidOnly && !refresh) {
    throw new Error("--invalid-only requires --refresh");
  }
  const requested = wordIds ? new Set(wordIds) : null;
  const allowed = new Set(
    words
      .filter(
        (word) =>
          (!category || word.category === category) &&
          (!wordId || word.id === wordId) &&
          (!requested || requested.has(word.id)),
      )
      .map(({ id }) => id),
  );
  if (wordId && !allowed.has(wordId)) throw new Error(`unknown or filtered word id: ${wordId}`);
  for (const id of requested ?? []) {
    if (!allowed.has(id)) throw new Error(`unknown or filtered word id: ${id}`);
  }

  const candidates: Candidate[] = [];
  for (const pair of MAIN_WORD_EXAMPLE_PAIRS) {
    if (!allowed.has(pair.id)) continue;
    for (const example of pair.examples) {
      for (const [language, sentence] of [
        ["en", example.en],
        ["ja", example.ja],
      ] as const) {
        if (languageFilter && language !== languageFilter) continue;
        if (!refresh && corpus[language][sentence]) continue;
        if (
          invalidOnly &&
          validateAuthoredSentence(language, sentence, corpus[language][sentence] ?? []).length === 0 &&
          !containsGeneratedMetaGloss(corpus[language][sentence])
        ) continue;
        candidates.push({
          key: `${pair.id}:${example.sortOrder}:${language}`,
          wordId: pair.id,
          sortOrder: example.sortOrder,
          language,
          sentence,
        });
      }
    }
  }
  return candidates;
}

function responseText(payload: ResponsesPayload): string {
  for (const output of payload.output ?? []) {
    for (const content of output.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  throw new Error(payload.error?.message || "OpenAI response contained no output text");
}

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "spans"],
        properties: {
          key: { type: "string" },
          spans: {
            type: "array",
            minItems: MIN_LEARNING_SPANS,
            maxItems: MAX_LEARNING_SPANS,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["t", "z", "j", "e", "b", "p", "r"],
              properties: {
                t: { type: "string" },
                z: { type: "string", minLength: 1 },
                j: { type: "string", minLength: 1 },
                e: { type: "string", minLength: 1 },
                b: { type: ["string", "null"] },
                p: { type: ["string", "null"], enum: [...EXAMPLE_SPAN_PARTS_OF_SPEECH, null] },
                r: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
  },
} as const;

type BatchGeneration = {
  generated: Map<string, AuthoredSpan[]>;
  failures: Map<string, string>;
};

// Each same-batch retry gets more sampling than the last, because the only thing that can
// change the answer is the sampling. A split is exempt: a different set of sentences in
// the request is already a different prompt.
function nextTemperature(temperature: number): number {
  return Math.min(1, Number((temperature + 0.25).toFixed(2)));
}

async function generateBatch(
  apiKey: string,
  batch: Candidate[],
  temperature: number,
): Promise<BatchGeneration> {
  const prompt = [
    "Annotate each exact sentence with the same lexical tap segmentation used by the picture dictionary's definition text.",
    "Return only tappable content units: normally one content word, compound word, or fixed lexical expression per span. Do not return whole clauses or sentence translations as one span.",
    "The t values must be exact, non-overlapping substrings in sentence order. You may and should omit function words, spaces, and punctuation; the program restores every omitted gap as an untappable span and verifies exact full-sentence coverage.",
    "Return 2-8 tappable units. The minimum of 2 is not a target: expose every useful everyday noun, main verb, adjective, adverb, numeral, content pronoun, compound, and genuinely fixed expression, up to 8.",
    "Articles, auxiliaries, ordinary prepositions and conjunctions, Japanese particles, sentence endings, whitespace, and punctuation are not tappable by themselves. Omit them unless they are inseparable parts of a fixed expression.",
    "For English, keep genuine phrasal verbs and fixed collocations together, such as 'look forward to' and 'take a shower'. Do not merge an ordinary subject, object, location, time expression, and action into one tap.",
    "For Japanese, return nouns, time words, adjectives, adverbs, and main verbs separately. Omit particles such as は, が, を, に, で, と, and の; the program will restore them as untappable text. Keep a verb's inflection and auxiliaries with that verb, for example 浴びます, 置いています, 確認してください, and 読まなかった.",
    "Never split one inflected word at an ending in either language: English crispy stays crispy, and Japanese units such as むいてください, 結んでください, 使い終わったら, and 洗って乾かして stay complete. Every main predicate and concrete noun should normally be tappable; do not hide the sentence's core action in an omitted gap.",
    "Exact example: for '私は毎朝シャワーを浴びます。', return '私' + '毎朝' + 'シャワー' + '浴びます'. Do not return '毎朝シャワーを浴びます。' or 'シャワーを浴びます。' as one tap.",
    "Exact English counterpart: for 'I take a shower every morning.', return 'I' + 'take a shower' + 'every morning'. The program restores the spaces and final period as untappable spans.",
    "For '私はキッチンで計量カップを使います。', return '私' + 'キッチン' + '計量カップ' + '使います'. For 'Add baking soda to the cookie dough.', return 'Add' + 'baking soda' + 'cookie dough'.",
    "Every returned span is tappable and must provide all three contextual glosses: z in Traditional Chinese, j in natural Japanese, and e in English. The j field is a short Japanese definition or contextual synonym written in normal Japanese; it is never a kana reading or a duplicate of r. The r field alone carries pronunciation.",
    "Translate only that word or fixed expression in its sentence context. A gloss must never paraphrase the remainder of the sentence. Never add grammar labels, parenthetical notes, or explanations such as 格助詞, 主語, object marker, polite form, or topic marker.",
    "A Japanese j gloss must be the clean contextual meaning itself. It must never describe conjugation or usage with meta-words such as 動作, 表現, 意味, 文法, 形, 丁寧, 依頼, 条件, 理由, 状態, 主語, 目的語, or 助詞.",
    "The z, j, and e glosses must not contain ( ), （ ）, or any other parenthetical annotation. Write a clean translation only.",
    "Traditional Chinese glosses must be natural Taiwan usage. Translate temporal 前に as 之前 or 前, never as the literal spatial 前面.",
    "Translate roles and fixed expressions by meaning rather than character by character; for example, 清掃の人 means 清潔人員／清潔人員之一 (cleaner), never 清潔的人.",
    "Use b for the dictionary base form only when useful. Use p only from the permitted enum.",
    "For every glossed Japanese span, r must read the ENTIRE t lexical unit from its first character to its last, including every inflection and auxiliary that belongs to its verb—not only the base form.",
    "In r, spell the complete phrase in kana. Convert every kanji and Latin letter to its kana reading; do not copy any kanji or Latin letters into r. Katakana loanwords may remain katakana. Preserve kana already present in t in the same order, including particles は/へ/を and the long-vowel mark ー. Omit punctuation only. English spans must have r=null.",
    "Do not rewrite, normalize, translate, or omit any part of the sentence.",
    JSON.stringify(batch.map(({ key, language, sentence }) => ({ key, language, sentence }))),
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      input: prompt,
      temperature,
      text: {
        format: {
          type: "json_schema",
          name: "example_sentence_spans",
          strict: true,
          schema: RESPONSE_SCHEMA,
        },
      },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenAI Responses HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }
  const body = (await response.json()) as ResponsesPayload & { usage?: unknown };
  logAttempt({ batchSize: batch.length, temperature, usage: body.usage });
  const parsed = JSON.parse(responseText(body)) as {
    items: Array<{ key: string; spans: GeneratedSpan[] }>;
  };
  const expected = new Map(batch.map((candidate) => [candidate.key, candidate]));
  const generated = new Map<string, AuthoredSpan[]>();
  const failures = new Map<string, string>();
  for (const item of parsed.items) {
    const candidate = expected.get(item.key);
    if (!candidate || generated.has(item.key) || failures.has(item.key)) {
      console.warn(`[example-spans] ignoring unexpected or duplicate generated key: ${item.key}`);
      continue;
    }
    try {
      const spans = alignAuthoredSpans(
        candidate.language,
        candidate.sentence,
        item.spans
          .filter(
            (span) =>
              /[\p{L}\p{N}]/u.test(span.t) &&
              !isStandaloneGrammarSpan(candidate.language, span.t),
          )
          .map((span) =>
            Object.fromEntries(
              Object.entries(span).filter(([, value]) => value !== null),
            ) as unknown as AuthoredSpan,
          ),
      );
      const issues = validateAuthoredSentence(candidate.language, candidate.sentence, spans);
      if (containsGeneratedMetaGloss(spans)) {
        issues.push("generated gloss contains a usage or conjugation explanation");
      }
      if (issues.length > 0) {
        failures.set(item.key, issues.join("; "));
        logAttempt({ key: item.key, accepted: false, batchSize: batch.length, issues: issues.join("; ") });
        continue;
      }
      generated.set(item.key, spans);
      logAttempt({ key: item.key, accepted: true, batchSize: batch.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.set(item.key, message);
      logAttempt({ key: item.key, accepted: false, batchSize: batch.length, issues: message });
    }
  }
  for (const key of expected.keys()) {
    if (!generated.has(key) && !failures.has(key)) {
      failures.set(key, "model omitted generated key");
      logAttempt({ key, accepted: false, batchSize: batch.length, issues: "model omitted generated key" });
    }
  }
  return { generated, failures };
}

async function generateResilient(
  apiKey: string,
  batch: Candidate[],
  retries = 10,
  temperature = TEMPERATURE,
): Promise<Map<string, AuthoredSpan[]>> {
  try {
    const { generated, failures } = await generateBatch(apiKey, batch, temperature);
    if (failures.size === 0) return generated;

    const failed = batch.filter(({ key }) => failures.has(key));
    if (generated.size > 0) {
      console.warn(
        `[example-spans] retrying ${failed.length}/${batch.length} rejected item(s): ${[...failures.entries()].slice(0, 3).map(([key, issue]) => `${key}: ${issue}`).join(" | ")}`,
      );
      const retried = await generateResilient(apiKey, failed, retries, nextTemperature(temperature));
      return new Map([...generated, ...retried]);
    }

    const failureSummary = [...failures.entries()]
      .slice(0, 3)
      .map(([key, issue]) => `${key}: ${issue}`)
      .join(" | ");
    if (batch.length === 1) {
      if (retries <= 0) throw new Error(failureSummary);
      console.warn(
        `[example-spans] retrying ${batch[0].key} at temperature ${nextTemperature(temperature)} (${retries} attempt${retries === 1 ? "" : "s"} left): ${failureSummary}`,
      );
      return generateResilient(apiKey, batch, retries - 1, nextTemperature(temperature));
    }
    console.warn(`[example-spans] splitting rejected batch of ${batch.length}: ${failureSummary}`);
    const middle = Math.ceil(batch.length / 2);
    const [left, right] = await Promise.all([
      generateResilient(apiKey, batch.slice(0, middle), retries, temperature),
      generateResilient(apiKey, batch.slice(middle), retries, temperature),
    ]);
    return new Map([...left, ...right]);
  } catch (error) {
    if (batch.length === 1) {
      if (retries <= 0) throw error;
      console.warn(
        `[example-spans] retrying ${batch[0].key} at temperature ${nextTemperature(temperature)} (${retries} attempt${retries === 1 ? "" : "s"} left): ${error instanceof Error ? error.message : String(error)}`,
      );
      return generateResilient(apiKey, batch, retries - 1, nextTemperature(temperature));
    }
    console.warn(
      `[example-spans] splitting failed batch of ${batch.length}: ${error instanceof Error ? error.message : String(error)}`,
    );
    const middle = Math.ceil(batch.length / 2);
    const [left, right] = await Promise.all([
      generateResilient(apiKey, batch.slice(0, middle), retries, temperature),
      generateResilient(apiKey, batch.slice(middle), retries, temperature),
    ]);
    return new Map([...left, ...right]);
  }
}

function writeCorpus(corpus: ExampleSpanCorpus, destination: URL = OUTPUT_PATH): void {
  const temp = new URL(`${destination.pathname}.tmp`, "file://");
  writeFileSync(temp, `${JSON.stringify(corpus, null, 1)}\n`, "utf8");
  renameSync(temp, destination);
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const outValue = valueFor(argv, "--out");
  const destination = outValue ? pathToFileURL(outValue) : OUTPUT_PATH;
  attemptLogPath = valueFor(argv, "--attempt-log");
  const batchSize = parsePositiveInteger(argv, "--batch-size", 5);
  const concurrency = parsePositiveInteger(argv, "--concurrency", 4);
  const corpus = loadExampleSpanCorpus();
  const candidates = candidatesFor(argv, corpus);
  console.log(`[example-spans] ${candidates.length} sentence(s) need generation`);
  for (const candidate of candidates.slice(0, 30)) {
    console.log(`  • ${candidate.key}: ${candidate.sentence}`);
  }
  if (candidates.length > 30) console.log(`  … ${candidates.length - 30} more`);
  if (!apply || candidates.length === 0) {
    console.log(apply ? "[example-spans] nothing to write" : "[example-spans] dry run; pass --apply to generate and write");
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required with --apply");
  const requiredApiKey: string = apiKey;
  let completed = 0;
  const batches: Candidate[][] = [];
  for (let offset = 0; offset < candidates.length; offset += batchSize) {
    batches.push(candidates.slice(offset, offset + batchSize));
  }
  let nextBatch = 0;
  async function worker(): Promise<void> {
    while (true) {
      const batchIndex = nextBatch;
      nextBatch += 1;
      const batch = batches[batchIndex];
      if (!batch) return;
      const generated = await generateResilient(requiredApiKey, batch);
      for (const candidate of batch) {
        corpus[candidate.language][candidate.sentence] = generated.get(candidate.key)!;
      }
      completed += batch.length;
      writeCorpus(corpus, destination);
      console.log(`[example-spans] generated ${completed}/${candidates.length}`);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, batches.length) }, () => worker()),
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error("[example-spans] failed:", error);
    process.exitCode = 1;
  });
}

export { nextTemperature };
