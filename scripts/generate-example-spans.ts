// Generate the tappable three-language gloss spans that must ship with every
// main-catalog English/Japanese example sentence. Dry by default; --apply
// writes only data/example-spans.json. Loading database rows remains a
// separate, explicitly write-enabled step.
//
//   npm run examples:spans
//   npm run examples:spans -- --category=bathroom --apply
//   npm run examples:spans -- --word-id=access-card --refresh --apply

import { renameSync, writeFileSync } from "node:fs";
import {
  alignAuthoredSpans,
  type AuthoredSpan,
  type ExampleSpanCorpus,
  EXAMPLE_SPAN_PARTS_OF_SPEECH,
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
const OUTPUT_PATH = new URL("../data/example-spans.json", import.meta.url);

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
  const refresh = argv.includes("--refresh");
  const allowed = new Set(
    words
      .filter((word) => (!category || word.category === category) && (!wordId || word.id === wordId))
      .map(({ id }) => id),
  );
  if (wordId && !allowed.has(wordId)) throw new Error(`unknown or filtered word id: ${wordId}`);

  const candidates: Candidate[] = [];
  for (const pair of MAIN_WORD_EXAMPLE_PAIRS) {
    if (!allowed.has(pair.id)) continue;
    for (const example of pair.examples) {
      for (const [language, sentence] of [
        ["en", example.en],
        ["ja", example.ja],
      ] as const) {
        if (!refresh && corpus[language][sentence]) continue;
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
            minItems: 1,
            maxItems: 20,
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

async function generateBatch(apiKey: string, batch: Candidate[]): Promise<Map<string, AuthoredSpan[]>> {
  const prompt = [
    "Split each exact sentence into tappable learning spans for an English/Japanese picture dictionary.",
    "The t values must concatenate character-for-character to the original sentence, including every space and punctuation mark.",
    "Return only meaningful everyday words or short phrases as spans. Do not return whitespace-only or punctuation-only spans; the program restores untouched gaps.",
    "Aim for 5-12 semantic spans per sentence and never return more than 20; keep natural multiword expressions together instead of splitting every token.",
    "Every returned span is tappable and must provide all three contextual glosses: z in Traditional Chinese, j in natural Japanese, and e in English.",
    "Use b for the dictionary base form only when useful. Use p only from the permitted enum.",
    "For every glossed Japanese span, provide r as its complete hiragana reading. English spans must have r=null.",
    "Do not rewrite, normalize, translate, or omit any part of the sentence.",
    JSON.stringify(batch.map(({ key, language, sentence }) => ({ key, language, sentence }))),
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      input: prompt,
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
  const parsed = JSON.parse(responseText((await response.json()) as ResponsesPayload)) as {
    items: Array<{ key: string; spans: GeneratedSpan[] }>;
  };
  const expected = new Map(batch.map((candidate) => [candidate.key, candidate]));
  const generated = new Map<string, AuthoredSpan[]>();
  for (const item of parsed.items) {
    const candidate = expected.get(item.key);
    if (!candidate || generated.has(item.key)) throw new Error(`unexpected generated key: ${item.key}`);
    const spans = alignAuthoredSpans(
      candidate.language,
      candidate.sentence,
      item.spans
        .filter((span) => /[\p{L}\p{N}]/u.test(span.t))
        .map((span) =>
          Object.fromEntries(
            Object.entries(span).filter(([, value]) => value !== null),
          ) as unknown as AuthoredSpan,
        ),
    );
    const issues = validateAuthoredSentence(candidate.language, candidate.sentence, spans);
    if (issues.length > 0) throw new Error(`${item.key}: ${issues.join("; ")}`);
    generated.set(item.key, spans);
  }
  for (const key of expected.keys()) {
    if (!generated.has(key)) throw new Error(`model omitted generated key: ${key}`);
  }
  return generated;
}

async function generateResilient(
  apiKey: string,
  batch: Candidate[],
): Promise<Map<string, AuthoredSpan[]>> {
  try {
    return await generateBatch(apiKey, batch);
  } catch (error) {
    if (batch.length === 1) throw error;
    console.warn(
      `[example-spans] splitting failed batch of ${batch.length}: ${error instanceof Error ? error.message : String(error)}`,
    );
    const middle = Math.ceil(batch.length / 2);
    const [left, right] = await Promise.all([
      generateResilient(apiKey, batch.slice(0, middle)),
      generateResilient(apiKey, batch.slice(middle)),
    ]);
    return new Map([...left, ...right]);
  }
}

function writeCorpus(corpus: ExampleSpanCorpus): void {
  const temp = new URL(`${OUTPUT_PATH.pathname}.tmp`, "file://");
  writeFileSync(temp, `${JSON.stringify(corpus, null, 1)}\n`, "utf8");
  renameSync(temp, OUTPUT_PATH);
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
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
      writeCorpus(corpus);
      console.log(`[example-spans] generated ${completed}/${candidates.length}`);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, batches.length) }, () => worker()),
  );
}

main().catch((error) => {
  console.error("[example-spans] failed:", error);
  process.exitCode = 1;
});
