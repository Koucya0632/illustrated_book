#!/usr/bin/env node
// Score the span generator itself: run it on a frozen held-out slice, then measure what
// the model produced before the generator's own gate cleaned up after it.
//
// Why it is not simply "grade the fresh output": scripts/generate-example-spans.ts
// validates every generated sentence with validateAuthoredSentence and retries up to ten
// times, and that validator enforces the same rules and the same constants (2-8 tappable
// spans, the 0.83 fraction, three-or-no glosses, kana-only readings, no meta glosses) the
// audit grader checks. Nothing that fails those rules can reach the corpus, so grading
// accepted output scores 100% by construction and measures nothing.
//
// So this eval records two different things:
//   firstPassYield  the share of sentences the model got right on its first attempt,
//                   with no retry. This is the real model/prompt quality signal, it
//                   drives cost and latency, and today it is only a console warning that
//                   scrolls past.
//   passRate        the structural grade of the accepted output. It is expected to be
//                   1.0 every run. It is kept because the day it is not, the generator's
//                   gate and the audit grader have drifted apart — two copies of one
//                   rule set, which is the failure this repo produces most often.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildAuditPayload } from "./corpus-to-audit.mjs";
import { compare, scoreFrom } from "./run-eval.mjs";

const EVALS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(EVALS_DIR);
// See run-eval.mjs: vendored by default, overridable at TUJI_AUDIT_SKILL_ROOT.
const SKILL_ROOT = process.env.TUJI_AUDIT_SKILL_ROOT ?? null;
const GRADER = SKILL_ROOT
  ? path.join(SKILL_ROOT, "audit-tuji-atlas", "scripts", "check-example-contract.mjs")
  : path.join(EVALS_DIR, "grader", "check-example-contract.mjs");
const HOLDOUT = path.join(EVALS_DIR, "fixtures", "spans-holdout.json");
// Slice A is where failures are read; slice B is where a change is scored. A prompt
// written from the failures of the slice it is then measured on reports its own fit,
// not an improvement — which is exactly what happened the first time this was measured.
const HOLDOUT_B = path.join(EVALS_DIR, "fixtures", "spans-holdout-b.json");
const CATALOG_FIXTURE = path.join(EVALS_DIR, "fixtures", "atlas-examples.json");
const BASELINE = path.join(EVALS_DIR, "baselines", "atlas-spans.generated.json");

// Measured, not guessed, and re-measured after the fix. Three runs of the identical
// 160-sentence slice used to return 88.1 / 78.8 / 83.8 — sd 4.7 points — because the
// generator sampled at the API's default temperature of 1.0. It now sends temperature 0
// on the first attempt and only raises it on a retry, and the same three runs return
// 89.4 / 86.3 / 88.1: sd 1.57.
//
// One run against a one-run baseline compounds that to sd ~2.2, so 95% is +/-4.4 points.
// Rounded up, hence this number. Tighten it only against another measurement.
const YIELD_TOLERANCE = 0.05;

// gpt-4.1-mini list price per million tokens, for reporting a run's cost only.
const PRICE_PER_MTOK = { input: 0.4, output: 1.6 };

function parseArgs(argv) {
  const options = { update: false, json: false, dry: false, limit: null, slice: "a" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--update") options.update = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--dry") options.dry = true;
    else if (arg === "--limit") options.limit = Number(argv[++i]);
    else if (arg === "--slice") options.slice = argv[++i];
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit <= 0)) {
    throw new Error("--limit must be a positive integer");
  }
  return options;
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// The whole generator file's hash moves for any edit, including a new CLI flag, so it
// cannot say whether the model's instructions changed. Hashing the prompt block alone
// can: a moved yield either has a moved prompt behind it or it does not.
export function promptSha256(generatorFile) {
  const source = fs.readFileSync(generatorFile, "utf8");
  const start = source.indexOf("const prompt = [");
  const end = source.indexOf('].join("\\n");', start);
  if (start === -1 || end === -1) return null;
  return createHash("sha256").update(source.slice(start, end)).digest("hex");
}

// The generator annotates the sentences in lib/main-word-example-pairs, which is not
// always what the database holds — an un-deployed sentence rewrite lives in the repo
// first. Grading repo-generated spans against database sentences then reports every
// rewritten sentence as a missing annotation, which looks like a generator failure and
// is not one. So the graded payload takes its sentences from the same place the
// generator took them, and only the surrounding metadata from the frozen fixture.
function readAuthoredPairs(wordIds, outFile) {
  const result = spawnSync(
    "npx",
    [
      "tsx",
      "-e",
      `import { MAIN_WORD_EXAMPLE_PAIRS } from "./lib/main-word-example-pairs";` +
        `import { writeFileSync } from "node:fs";` +
        `const want = new Set(${JSON.stringify(wordIds)});` +
        `writeFileSync(${JSON.stringify(outFile)}, JSON.stringify(` +
        `MAIN_WORD_EXAMPLE_PAIRS.filter((p) => want.has(p.id))));`,
    ],
    { cwd: PROJECT_ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(`could not read authored pairs: ${result.stderr?.slice(-800) ?? ""}`);
  }
  return JSON.parse(fs.readFileSync(outFile, "utf8"));
}

function generate(wordIds, corpusOut, attemptLog) {
  const result = spawnSync(
    "npx",
    [
      "tsx",
      "--env-file=.env.local",
      "scripts/generate-example-spans.ts",
      `--word-ids=${wordIds.join(",")}`,
      "--refresh",
      "--apply",
      `--out=${corpusOut}`,
      `--attempt-log=${attemptLog}`,
    ],
    { cwd: PROJECT_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(`generator failed (exit ${result.status}):\n${result.stderr?.slice(-2000) ?? ""}`);
  }
  return result.stderr ?? "";
}

// One JSONL row per model attempt. Rows carrying `key` are per-sentence verdicts; rows
// carrying only `usage` are per-request token counts.
export function readAttemptLog(file) {
  const rows = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const attemptsByKey = new Map();
  const usage = { input: 0, output: 0, requests: 0 };
  for (const row of rows) {
    if (row.usage) {
      usage.requests += 1;
      usage.input += row.usage.input_tokens ?? 0;
      usage.output += row.usage.output_tokens ?? 0;
      continue;
    }
    if (!row.key) continue;
    const list = attemptsByKey.get(row.key) ?? [];
    list.push(row);
    attemptsByKey.set(row.key, list);
  }

  const sentences = attemptsByKey.size;
  let firstPassAccepted = 0;
  let totalAttempts = 0;
  const rejectionReasons = {};
  for (const attempts of attemptsByKey.values()) {
    totalAttempts += attempts.length;
    if (attempts[0].accepted) firstPassAccepted += 1;
    for (const attempt of attempts) {
      if (attempt.accepted) continue;
      // Collapse a rejection to its rule, dropping span indices and quoted text so the
      // same broken rule lands in the same bucket across runs.
      for (const issue of String(attempt.issues ?? "unknown").split("; ")) {
        const rule = issue
          .replace(/^span \d+ /, "span ")
          .replace(/: .*$/, "")
          .replace(/\d+/g, "N")
          .trim();
        rejectionReasons[rule] = (rejectionReasons[rule] ?? 0) + 1;
      }
    }
  }

  return {
    sentences,
    firstPassAccepted,
    firstPassYield: sentences === 0 ? 0 : Number((firstPassAccepted / sentences).toFixed(4)),
    totalAttempts,
    attemptsPerSentence: sentences === 0 ? 0 : Number((totalAttempts / sentences).toFixed(3)),
    retriedSentences: sentences - firstPassAccepted,
    rejectionReasons: Object.fromEntries(
      Object.entries(rejectionReasons).sort((a, b) => b[1] - a[1]),
    ),
    usage: {
      ...usage,
      estimatedCostUsd: Number(
        ((usage.input / 1e6) * PRICE_PER_MTOK.input + (usage.output / 1e6) * PRICE_PER_MTOK.output).toFixed(4),
      ),
    },
  };
}

function gradeCorpus(payloadFile) {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "tuji-geneval-"));
  try {
    const result = spawnSync(
      process.execPath,
      [GRADER, "--input", payloadFile, "--output-dir", outputDir, "--json"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    if (result.status === 2 || result.error) {
      throw new Error(`grader failed to run: ${result.error?.message ?? result.stderr.trim()}`);
    }
    return JSON.parse(result.stdout);
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      `Usage:\n  node evals/run-generation-eval.mjs [--limit N] [--dry] [--update] [--json]\n\n` +
        `  --dry     report the slice and stop, without calling the model\n` +
        `  --limit   generate only the first N held-out words (a cheap smoke run)\n` +
        `  --slice   a (default, where failures are read) or b (measurement only)\n` +
        `  --update  record this run as the new baseline\n\n` +
        `Calls OpenAI with OPENAI_API_KEY from .env.local and never writes data/example-spans.json.`,
    );
    return;
  }

  if (!fs.existsSync(GRADER)) throw new Error(`grader not found: ${GRADER}`);
  if (options.slice !== "a" && options.slice !== "b") {
    throw new Error(`unknown slice: ${options.slice} (known: a, b)`);
  }
  const holdoutFile = options.slice === "b" ? HOLDOUT_B : HOLDOUT;
  const holdout = JSON.parse(fs.readFileSync(holdoutFile, "utf8"));
  const wordIds = options.limit ? holdout.wordIds.slice(0, options.limit) : holdout.wordIds;

  if (options.dry) {
    console.log(`held-out slice: ${wordIds.length} words across ${holdout.categories.length} categories`);
    console.log(`sentences: ${wordIds.length * 4} (2 examples x en/ja)`);
    console.log(wordIds.join(", "));
    console.log("no model call made (--dry)");
    return;
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "tuji-spans-"));
  const corpusOut = path.join(workDir, "generated-corpus.json");
  const attemptLog = path.join(workDir, "attempts.jsonl");
  fs.writeFileSync(attemptLog, "", "utf8");

  const startedAt = Date.now();
  generate(wordIds, corpusOut, attemptLog);
  const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);

  const generation = readAttemptLog(attemptLog);
  const corpus = JSON.parse(fs.readFileSync(corpusOut, "utf8"));

  // Sentences come from the authored pairs the generator just annotated; CEFR bands,
  // example ids and the Chinese translation come from the frozen fixture, joined on
  // sort order. Anything the eval reports is then about the spans, never about which
  // copy of a sentence it happened to look up.
  const catalog = JSON.parse(fs.readFileSync(CATALOG_FIXTURE, "utf8"));
  const selected = new Set(wordIds);
  const authored = new Map(
    readAuthoredPairs(wordIds, path.join(workDir, "authored-pairs.json")).map((pair) => [
      pair.id,
      new Map(pair.examples.map((example) => [example.sortOrder, example])),
    ]),
  );
  let rewrittenSentences = 0;
  const words = catalog.words
    .filter((word) => selected.has(word.id))
    .map((word) => ({
      ...word,
      examples: word.examples.map((example) => {
        const pair = authored.get(word.id)?.get(example.sortOrder);
        if (!pair) return example;
        if (pair.en !== example.en) rewrittenSentences += 1;
        if (pair.ja !== example.ja) rewrittenSentences += 1;
        return { ...example, en: pair.en, ja: pair.ja };
      }),
    }));
  const payloadFile = path.join(workDir, "graded-payload.json");
  fs.writeFileSync(
    payloadFile,
    `${JSON.stringify(buildAuditPayload({ words, corpus, source: "generated" }), null, 2)}\n`,
    "utf8",
  );

  const report = gradeCorpus(payloadFile);
  const score = scoreFrom(report, { scoredTiers: ["mechanical"] });
  score.generation = {
    ...generation,
    model: process.env.EXAMPLE_SPANS_MODEL ?? "gpt-4.1-mini",
    elapsedSeconds,
    rewrittenSentences,
  };
  // The sentences themselves are an input to this measurement, so they get a hash for
  // the same reason the fixture does: a yield that moved because the slice's text was
  // rewritten between runs is not a yield that moved because the model got worse.
  const sentencesSha256 = createHash("sha256")
    .update(JSON.stringify(words.map((w) => w.examples.map((e) => [e.en, e.ja]))))
    .digest("hex");

  const current = {
    target: "atlas-spans",
    source: "generated",
    recordedAt: new Date().toISOString(),
    slice: options.slice,
    fixtureSha256: sha256(holdoutFile),
    sentencesSha256,
    graderSha256: sha256(GRADER),
    generatorSha256: sha256(path.join(PROJECT_ROOT, "scripts", "generate-example-spans.ts")),
    promptSha256: promptSha256(path.join(PROJECT_ROOT, "scripts", "generate-example-spans.ts")),
    score,
  };

  const baselineFile = options.slice === "b" ? BASELINE.replace(".json", ".b.json") : BASELINE;
  const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, "utf8")) : null;
  // A baseline someone marked stale describes a world that no longer exists. Comparing to
  // it would produce a delta with nothing behind it.
  const result = baseline?.stale
    ? {
        verdict: "incomparable",
        notes: [`baseline is marked stale: ${baseline.stale}`],
        newIssues: [],
        fixedIssues: [],
      }
    : baseline
    ? compare(baseline, current, {
        verdictBy: "rate",
        tolerance: YIELD_TOLERANCE,
        rateAt: "generation.firstPassYield",
      })
    : { verdict: "no-baseline", notes: ["no baseline recorded yet"], newIssues: [], fixedIssues: [] };

  if (baseline && baseline.promptSha256 && baseline.promptSha256 !== current.promptSha256) {
    result.notes.push("the model's instructions changed since the baseline — the prompt itself explains a moved yield");
  } else if (baseline && baseline.generatorSha256 !== current.generatorSha256) {
    result.notes.push("generator script changed since the baseline, but its prompt did not — look at the gate, not the instructions");
  }
  if (baseline && baseline.sentencesSha256 && baseline.sentencesSha256 !== current.sentencesSha256) {
    result.notes.push(
      "the held-out sentences themselves were rewritten since the baseline — this yield is not comparable to it",
    );
  }
  if (rewrittenSentences > 0) {
    result.notes.push(
      `${rewrittenSentences} held-out sentence(s) differ from the frozen fixture — the repo carries text the database has not got yet`,
    );
  }

  if (options.update) {
    fs.writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  }

  if (options.json) {
    console.log(JSON.stringify({ current, baseline, result, workDir }, null, 2));
  } else {
    const g = score.generation;
    console.log(`eval: atlas-spans (source: generated, model ${g.model})`);
    console.log(`held-out: ${wordIds.length} words / ${g.sentences} sentences (${elapsedSeconds}s)`);
    console.log(`first-pass yield: ${(g.firstPassYield * 100).toFixed(1)}%  (${g.firstPassAccepted}/${g.sentences} accepted with no retry)`);
    console.log(`attempts per sentence: ${g.attemptsPerSentence}  (${g.retriedSentences} sentence(s) needed a retry)`);
    console.log(`structural grade of accepted output: ${(score.passRate * 100).toFixed(2)}% (expected 100.00%)`);
    if (g.rewrittenSentences > 0) {
      console.log(`held-out text: ${g.rewrittenSentences} sentence(s) newer in the repo than in the fixture`);
    }
    console.log(`cost: $${g.usage.estimatedCostUsd} over ${g.usage.requests} request(s), ${g.usage.input} in / ${g.usage.output} out`);
    const reasons = Object.entries(g.rejectionReasons);
    if (reasons.length > 0) {
      console.log("rejected because:");
      for (const [rule, count] of reasons.slice(0, 8)) console.log(`  ${count}x ${rule}`);
    }
    if (baseline) console.log(`baseline: ${(baseline.score.generation.firstPassYield * 100).toFixed(1)}% recorded ${baseline.recordedAt}`);
    console.log(`verdict: ${result.verdict}`);
    for (const note of result.notes) console.log(`  note: ${note}`);
    console.log(`artifacts: ${workDir}`);
    if (options.update) console.log(`baseline written: ${path.relative(PROJECT_ROOT, BASELINE)}`);
  }

  // A structural failure means the generator's gate let through something the audit
  // grader rejects. That is a drift between two copies of one rule set, and it fails the
  // run regardless of what the yield did.
  if (score.passRate < 1) {
    console.error("structural grade below 100%: the generator's validator and the audit grader disagree");
    process.exitCode = 1;
  } else if (result.verdict === "regressed") process.exitCode = 1;
  else if (result.verdict === "no-baseline" && !options.update) process.exitCode = 2;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(`[tuji-eval] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
