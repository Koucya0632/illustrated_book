import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import { alignAuthoredSpans } from "../lib/example-span-corpus";
import { MAIN_WORD_EXAMPLE_PAIRS } from "../lib/main-word-example-pairs";
import { nextTemperature } from "../scripts/generate-example-spans";
import { auditFromSpans, verifyAgainstAudited } from "../evals/corpus-to-audit.mjs";
import { compare } from "../evals/run-eval.mjs";
import { promptSha256, readAttemptLog } from "../evals/run-generation-eval.mjs";

function loadPair() {
  const fixture = JSON.parse(
    readFileSync(new URL("../evals/fixtures/atlas-examples.json", import.meta.url), "utf8"),
  );
  const corpus = JSON.parse(
    readFileSync(new URL("../data/example-spans.json", import.meta.url), "utf8"),
  );
  return { fixture, corpus };
}

test("the corpus converter reproduces the database's own span arithmetic", () => {
  // The frozen fixture holds audit objects the grader computed in SQL from the database;
  // data/example-spans.json holds the corpus rows those spans came from. Wherever both
  // sides have a sentence, recomputing one from the other must land on exactly the same
  // numbers, or the eval grades fresh output with a ruler that does not match the one
  // grading the catalog.
  const { fixture, corpus } = loadPair();
  const mismatches = verifyAgainstAudited({ auditedWords: fixture.words, corpus });
  assert.deepEqual(
    mismatches.filter((m: { field: string }) => m.field !== "presence"),
    [],
  );
});

test("a sentence missing from the corpus is only ever one the repo has rewritten", () => {
  // The corpus is keyed by sentence text, so an un-deployed rewrite in
  // lib/main-word-example-pairs legitimately leaves the database's older sentence with no
  // annotation. That is a deployment state, not a defect. A gap on a sentence the repo
  // still agrees with the database about is a different thing entirely — an annotation
  // that went missing — and must fail.
  type Sentences = { en: string; ja: string };
  type FixtureExample = Sentences & { id: string; sortOrder: number };
  type FixtureWord = { id: string; examples: FixtureExample[] };
  type Gap = { wordId: string; exampleId: string; language: "en" | "ja"; field: string };

  const { fixture, corpus } = loadPair();
  const words = fixture.words as FixtureWord[];
  const authored = new Map<string, Map<number, Sentences>>(
    MAIN_WORD_EXAMPLE_PAIRS.map((pair) => [
      pair.id,
      new Map<number, Sentences>(
        pair.examples.map((example) => [example.sortOrder, example as Sentences]),
      ),
    ]),
  );
  const byId = new Map(words.map((word) => [word.id, word]));

  const unexplained = (verifyAgainstAudited({ auditedWords: words, corpus }) as Gap[])
    .filter((gap) => gap.field === "presence")
    .filter((gap) => {
      const example = byId.get(gap.wordId)?.examples.find((e) => e.id === gap.exampleId);
      if (!example) return true;
      const pair = authored.get(gap.wordId)?.get(example.sortOrder);
      // Explained when the repo now carries different text for that sentence.
      return !pair || pair[gap.language] === example[gap.language];
    });

  assert.deepEqual(unexplained, []);
});

test("a span counts as glossed only with all three languages", () => {
  const audit = auditFromSpans([
    { t: "犬", z: "狗", j: "いぬ", e: "dog", r: "いぬ" },
    { t: "が" },
    { t: "走る", z: "跑", e: "run", r: "はしる" },
  ]);
  assert.ok(audit);
  assert.equal(audit.spanCount, 3);
  assert.equal(audit.glossedSpanCount, 1);
  assert.equal(audit.partialGlossCount, 1);
  assert.deepEqual(audit.glossed, [true, false, false]);
  assert.equal(audit.reconstructed, "犬が走る");
});

test("a glossed Japanese span with no reading is counted as missing one", () => {
  const audit = auditFromSpans([
    { t: "本", z: "書", j: "ほん", e: "book" },
    { t: "を" },
    { t: "読む", z: "讀", j: "よむ", e: "read", r: "よむ" },
  ]);
  assert.ok(audit);
  assert.equal(audit.missingReadingCount, 1);
  assert.equal(audit.unexpectedReadingCount, 1);
  assert.deepEqual(audit.readings, [null, null, "よむ"]);
});

test("parenthetical and grammar-term glosses are counted as meta glosses", () => {
  const audit = auditFromSpans([
    { t: "を", z: "助詞", j: "を", e: "object marker (particle)" },
    { t: "水", z: "水", j: "みず", e: "water", r: "みず" },
  ]);
  assert.ok(audit);
  assert.equal(audit.metaGlossCount, 2);
});

test("an empty span list has no audit at all", () => {
  assert.equal(auditFromSpans([]), null);
  assert.equal(auditFromSpans(undefined), null);
});

function attemptLog(rows: unknown[]) {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "tuji-attempt-")), "attempts.jsonl");
  writeFileSync(file, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
  return file;
}

test("first-pass yield counts only sentences accepted on the first attempt", () => {
  const file = attemptLog([
    { key: "a:0:en", accepted: true, batchSize: 2 },
    { key: "b:0:ja", accepted: false, batchSize: 2, issues: "span 3 reading omits kana" },
    { key: "b:0:ja", accepted: true, batchSize: 1 },
  ]);
  const stats = readAttemptLog(file);
  assert.equal(stats.sentences, 2);
  assert.equal(stats.firstPassAccepted, 1);
  assert.equal(stats.firstPassYield, 0.5);
  assert.equal(stats.retriedSentences, 1);
  assert.equal(stats.attemptsPerSentence, 1.5);
});

test("rejection reasons are bucketed by rule, not by span index", () => {
  // "span 3 …" and "span 11 …" are the same broken rule. If the index stayed in the key
  // the histogram would scatter one problem across a dozen buckets.
  const file = attemptLog([
    { key: "a:0:ja", accepted: false, batchSize: 5, issues: "span 3 reading omits kana from the complete phrase" },
    { key: "a:0:ja", accepted: false, batchSize: 1, issues: "span 11 reading omits kana from the complete phrase" },
    { key: "a:0:ja", accepted: true, batchSize: 1 },
  ]);
  const stats = readAttemptLog(file);
  assert.deepEqual(stats.rejectionReasons, {
    "span reading omits kana from the complete phrase": 2,
  });
});

test("token usage rows are summed into a cost, not mistaken for sentences", () => {
  const file = attemptLog([
    { batchSize: 5, usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 } },
    { key: "a:0:en", accepted: true, batchSize: 5 },
  ]);
  const stats = readAttemptLog(file);
  assert.equal(stats.sentences, 1);
  assert.equal(stats.usage.requests, 1);
  assert.equal(stats.usage.estimatedCostUsd, 2);
});

function generationRecord(firstPassYield: number) {
  return {
    target: "atlas-spans",
    source: "generated",
    fixtureSha256: "a".repeat(64),
    graderSha256: "b".repeat(64),
    score: {
      scope: { words: 40, examples: 80 },
      issueKeys: [] as string[],
      generation: { firstPassYield },
    },
  };
}

const RATE = { verdictBy: "rate" as const, tolerance: 0.05, rateAt: "generation.firstPassYield" };

test("a yield drop inside the tolerance is noise, not a regression", () => {
  const result = compare(generationRecord(0.863), generationRecord(0.825), RATE);
  assert.equal(result.verdict, "unchanged");
});

test("a yield drop past the tolerance is a regression", () => {
  const result = compare(generationRecord(0.863), generationRecord(0.79), RATE);
  assert.equal(result.verdict, "regressed");
  assert.equal(result.delta, -0.073);
});

test("a yield gain past the tolerance is an improvement", () => {
  const result = compare(generationRecord(0.863), generationRecord(0.95), RATE);
  assert.equal(result.verdict, "improved");
});

test("a stochastic target never fails on key-set noise alone", () => {
  // The same held-out slice produces different spans every run. Under key comparison a
  // single differing span would read as a regression; under rate comparison it does not.
  const baseline = generationRecord(0.863);
  const current = generationRecord(0.87);
  current.score.issueKeys = ["some-category|word|1||field"];
  assert.equal(compare(baseline, current, RATE).verdict, "unchanged");
  assert.equal(compare(baseline, current).verdict, "regressed");
});

test("the prompt hash covers the model's instructions and nothing else", () => {
  // This returned null for a while: the extraction searched for `].join("\n")` written
  // with a real newline instead of a literal backslash-n, found nothing, and reported
  // no hash rather than an error. A null hash silently disables the whole check, so the
  // contract is pinned from both sides — it must move for a prompt edit, and must not
  // move for an edit anywhere else in the file.
  const generator = new URL("../scripts/generate-example-spans.ts", import.meta.url);
  const original = readFileSync(generator, "utf8");
  const baseline = promptSha256(fileURLToPath(generator));
  assert.match(baseline ?? "", /^[0-9a-f]{64}$/);

  const dir = mkdtempSync(path.join(tmpdir(), "tuji-prompt-"));
  const editedPrompt = path.join(dir, "prompt-edited.ts");
  writeFileSync(
    editedPrompt,
    original.replace(
      "Do not rewrite, normalize, translate, or omit any part of the sentence.",
      "Do not rewrite or omit any part of the sentence.",
    ),
    "utf8",
  );
  assert.notEqual(promptSha256(editedPrompt), baseline, "a prompt edit must move the hash");

  const editedElsewhere = path.join(dir, "flag-added.ts");
  writeFileSync(
    editedElsewhere,
    original.replace(
      'const apply = argv.includes("--apply");',
      'const apply = argv.includes("--apply");\n  const unusedFlag = argv.includes("--nothing");',
    ),
    "utf8",
  );
  assert.equal(
    promptSha256(editedElsewhere),
    baseline,
    "an edit outside the prompt must not move the hash",
  );
});

test("a retry raises the temperature, because nothing else about the request changes", () => {
  // Determinism is what makes the first attempt a stable measurement, and it is also what
  // makes a retry pointless: the same input to a temperature-0 model returns the same
  // rejection. Before this escalation existed, intersection:0:ja was rejected twenty
  // identical times and took the whole generation run down with it.
  assert.equal(nextTemperature(0), 0.25);
  assert.equal(nextTemperature(0.25), 0.5);
  assert.equal(nextTemperature(0.5), 0.75);
  assert.equal(nextTemperature(0.75), 1);
});

test("escalation stops at 1 rather than climbing past the API's range", () => {
  assert.equal(nextTemperature(1), 1);
  assert.equal(nextTemperature(0.9), 1);
});

test("escalation always moves, so a retry is never a repeat of its own attempt", () => {
  // The loop retries up to ten times; every step must differ from the one before it or
  // the deadlock comes back.
  let temperature = 0;
  const seen = [temperature];
  for (let i = 0; i < 10; i += 1) {
    const next = nextTemperature(temperature);
    if (next === temperature) {
      // Only legal once the ceiling is reached, where batch splitting is what varies.
      assert.equal(temperature, 1, "temperature stalled below the ceiling");
      break;
    }
    temperature = next;
    seen.push(temperature);
  }
  assert.deepEqual(seen, [0, 0.25, 0.5, 0.75, 1]);
});

test("the two held-out slices share no words", () => {
  // Slice A is where generation failures are read; slice B is where a change is scored.
  // The first prompt change in this repo was written from slice A's failures and then
  // measured on slice A, which reports fit rather than improvement. Overlap would let
  // that happen again without anyone noticing, so it is checked rather than remembered.
  const a = JSON.parse(
    readFileSync(new URL("../evals/fixtures/spans-holdout.json", import.meta.url), "utf8"),
  ) as { wordIds: string[] };
  const b = JSON.parse(
    readFileSync(new URL("../evals/fixtures/spans-holdout-b.json", import.meta.url), "utf8"),
  ) as { wordIds: string[] };
  const overlap = b.wordIds.filter((id) => new Set(a.wordIds).has(id));
  assert.deepEqual(overlap, []);
  assert.equal(new Set([...a.wordIds, ...b.wordIds]).size, a.wordIds.length + b.wordIds.length);
});

test("an alignment failure says which of its two causes it is", () => {
  // "not present in sentence order" covers two unrelated mistakes: text that is nowhere
  // in the sentence (a phrasal verb split by its object, rejoined) and text that is
  // there but before the cursor (spans listed out of order). Telling them apart is what
  // made the difference between guessing at a prompt rule and knowing which one.
  const sentence = "When the bath mat becomes damp, hang it up before mold starts to grow.";
  assert.throws(
    () => alignAuthoredSpans("en", sentence, [{ t: "hang up", z: "掛", j: "かける", e: "hang" }]),
    /not a contiguous substring of the sentence at all/,
  );
  assert.throws(
    () =>
      alignAuthoredSpans("en", sentence, [
        { t: "damp", z: "潮濕", j: "しめった", e: "damp" },
        { t: "bath mat", z: "浴室地墊", j: "バスマット", e: "bath mat" },
      ]),
    /an earlier span already claimed it/,
  );
});
