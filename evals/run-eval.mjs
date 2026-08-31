#!/usr/bin/env node
// Score a frozen fixture with an audit grader and compare against a recorded baseline.
//
// This is deliberately NOT the audit skill. The skill answers "is the live catalog
// correct right now?" and walks a moving scope. An eval answers "did the number move,
// and can the move be attributed?" — which requires a frozen input and a stored
// previous run. This runner supplies those two things and nothing else: it shells out
// to the skill's documented CLI and never reaches into its internals.
//
// Two sources, one baseline format:
//   --source fixture   score the frozen snapshot. Deterministic, offline, and constant
//                      by construction — so it moves only when the fixture or the
//                      grader moves, which is exactly what its hashes are for. This is
//                      also the slot a generator's fresh output drops into later.
//   --source database  score the live published catalog against that same recorded
//                      score. This is the mode that catches a data regression today:
//                      the frozen side is the expectation, the live side is what varies.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const EVALS_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SKILL_ROOT = path.join(os.homedir(), ".codex", "skills");
// The grader ships vendored in evals/grader so CI can run this without the Codex skill
// installed. TUJI_AUDIT_SKILL_ROOT still points at a skill checkout when you want to
// score against an unreleased grader; evals/grader/README.md covers keeping them in step.
const SKILL_ROOT = process.env.TUJI_AUDIT_SKILL_ROOT ?? null;
const PROJECT_ROOT = path.dirname(EVALS_DIR);

const TARGETS = {
  // The deterministic tier of the two-example / click-translation contract.
  // Fully offline: the fixture is the grader's whole world, so a score change can
  // only come from the fixture or the grader, and both are hashed below.
  "atlas-examples": {
    grader: SKILL_ROOT
      ? path.join(SKILL_ROOT, "audit-tuji-atlas", "scripts", "check-example-contract.mjs")
      : path.join(EVALS_DIR, "grader", "check-example-contract.mjs"),
    fixture: path.join(EVALS_DIR, "fixtures", "atlas-examples.json"),
    baselineFor: (source) =>
      path.join(EVALS_DIR, "baselines", `atlas-examples.${source}.json`),
    // The semantic tier is a per-item human/agent review. It is out of scope here and
    // is reported as not-scored rather than folded into the number as a failure.
    scoredTiers: ["mechanical"],
  },
};

function parseArgs(argv) {
  const options = {
    target: "atlas-examples",
    source: "fixture",
    update: false,
    json: false,
    help: false,
    fixture: null,
    baseline: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target") options.target = argv[++i];
    else if (arg === "--source") options.source = argv[++i];
    else if (arg === "--fixture") options.fixture = path.resolve(argv[++i]);
    else if (arg === "--baseline") options.baseline = path.resolve(argv[++i]);
    else if (arg === "--update") options.update = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!Object.hasOwn(TARGETS, options.target)) {
    throw new Error(
      `unknown target: ${options.target} (known: ${Object.keys(TARGETS).join(", ")})`,
    );
  }
  if (options.source !== "fixture" && options.source !== "database") {
    throw new Error(`unknown source: ${options.source} (known: fixture, database)`);
  }
  return options;
}

function displayPath(file) {
  const relative = path.relative(process.cwd(), file);
  return relative.startsWith("..") ? file : relative;
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// The grader reports every finding as a flat issue record. A stable key per finding is
// what makes "3 issues" distinguishable from "3 different issues" — a count alone
// cannot tell a fix plus a new break from no change at all.
export function issueKey(issue) {
  return [
    issue.category ?? "",
    issue.wordId ?? "",
    issue.exampleId ?? "",
    issue.slot ?? "",
    issue.field ?? "",
  ].join("|");
}

function runGrader(target, source) {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "tuji-eval-"));
  // Database mode is the grader's own SELECT-only path; it resolves DATABASE_URL from
  // the project's .env.local exactly as the audit skill does. Nothing here writes.
  const sourceArgs =
    source === "database"
      ? ["--project-root", PROJECT_ROOT]
      : ["--input", target.fixture];
  try {
    const result = spawnSync(
      process.execPath,
      [target.grader, ...sourceArgs, "--output-dir", outputDir, "--json"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    // Exit 1 means the grader found issues, which is an ordinary eval outcome and must
    // not abort the run. Exit 2 is the grader failing to grade at all.
    if (result.status === 2 || result.error) {
      throw new Error(
        `grader failed to run: ${result.error?.message ?? result.stderr.trim()}`,
      );
    }
    try {
      return JSON.parse(result.stdout);
    } catch {
      throw new Error(`grader did not emit JSON on stdout: ${result.stdout.slice(0, 400)}`);
    }
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

export function scoreFrom(report, target) {
  const scored = report.issues.filter((issue) =>
    // review-incomplete is the semantic tier announcing it was never filled in. It is a
    // statement about scope, not a defect in the data, so it stays out of the number.
    issue.category !== "review-incomplete",
  );
  const failingWords = new Set(scored.map((issue) => issue.wordId).filter(Boolean));
  const words = report.counts.words;
  return {
    scope: { words, examples: report.counts.examples },
    tiers: {
      mechanical: report.mechanicalStatus,
      semantic: target.scoredTiers.includes("semantic") ? report.semanticReviewStatus : "not-scored",
    },
    passRate: words === 0 ? 0 : Number(((words - failingWords.size) / words).toFixed(4)),
    failingWords: failingWords.size,
    issueCount: scored.length,
    // Derived from the scored issues, not copied from the grader's summary, so the
    // category tally can never disagree with issueCount about what was counted.
    categories: Object.fromEntries(
      [...new Set(scored.map((issue) => issue.category))]
        .sort()
        .map((category) => [category, scored.filter((issue) => issue.category === category).length]),
    ),
    issueKeys: [...new Set(scored.map(issueKey))].sort(),
  };
}

// `options.verdictBy` picks how the verdict is decided:
//   "keys" — any finding key that is new is a regression. Correct when the input is
//            deterministic, where a new key can only mean a real change.
//   "rate" — compare a rate field against the baseline with a tolerance. Required when a
//            model is in the loop: the same input produces different spans every run, so
//            key-set equality would report a regression on sampling noise alone.
export function compare(baseline, current, options = {}) {
  const { verdictBy = "keys", tolerance = 0, rateAt = null } = options;
  const notes = [];
  let verdict = "unchanged";

  // A score is only comparable to a score produced the same way. A baseline recorded
  // from the frozen fixture answers a different question than one recorded from the
  // live catalog, so the two never compare.
  if (baseline.source !== current.source) {
    return {
      verdict: "incomparable",
      notes: [
        `baseline was recorded from ${baseline.source}, this run scored ${current.source}`,
      ],
      newIssues: [],
      fixedIssues: [],
    };
  }
  // In fixture mode the input is supposed to be immutable, so a moved hash makes the
  // delta unattributable — say so instead of printing a number that looks like a
  // result. In database mode the input is expected to move; that is the point.
  if (current.source === "fixture" && baseline.fixtureSha256 !== current.fixtureSha256) {
    return {
      verdict: "incomparable",
      notes: [
        "fixture changed since the baseline was recorded — the delta cannot be attributed",
        `baseline fixture ${baseline.fixtureSha256.slice(0, 12)} vs current ${current.fixtureSha256.slice(0, 12)}`,
        "re-freeze deliberately, then re-record with --update",
      ],
      newIssues: [],
      fixedIssues: [],
    };
  }
  if (baseline.graderSha256 !== current.graderSha256) {
    notes.push(
      `grader changed since the baseline was recorded (${baseline.graderSha256.slice(0, 12)} → ${current.graderSha256.slice(0, 12)}) — a moved score may be the ruler, not the data`,
    );
  }
  if (baseline.score.scope?.words !== current.score.scope?.words) {
    notes.push(
      `scope moved: ${baseline.score.scope?.words} → ${current.score.scope?.words} words`,
    );
  }
  if (current.source === "database" && current.fixtureSha256 !== baseline.fixtureSha256) {
    notes.push("frozen fixture changed since this baseline — forensic diffs will not line up");
  }

  const before = new Set(baseline.score.issueKeys ?? []);
  const after = new Set(current.score.issueKeys ?? []);
  const newIssues = [...after].filter((key) => !before.has(key));
  const fixedIssues = [...before].filter((key) => !after.has(key));

  if (verdictBy === "rate") {
    const read = (record) => rateAt.split(".").reduce((value, key) => value?.[key], record.score);
    const was = read(baseline);
    const now = read(current);
    if (typeof was !== "number" || typeof now !== "number") {
      return {
        verdict: "incomparable",
        notes: [`rate field ${rateAt} is missing from the baseline or this run`],
        newIssues,
        fixedIssues,
      };
    }
    const delta = Number((now - was).toFixed(4));
    notes.push(`${rateAt}: ${was} → ${now} (${delta >= 0 ? "+" : ""}${delta}, tolerance ${tolerance})`);
    if (delta < -tolerance) verdict = "regressed";
    else if (delta > tolerance) verdict = "improved";
    else verdict = "unchanged";
    return { verdict, notes, newIssues, fixedIssues, delta };
  }

  if (newIssues.length > 0) verdict = "regressed";
  else if (fixedIssues.length > 0) verdict = "improved";

  return { verdict, notes, newIssues, fixedIssues };
}

function helpText() {
  return `Usage:
  node evals/run-eval.mjs [--target ${Object.keys(TARGETS).join("|")}] [--source fixture|database] [--update] [--json]

  --source    fixture (default, offline and deterministic) or database (live SELECT-only)
  --update    record the current score as the new baseline (review the diff first)
  --json      machine-readable result on stdout
  --fixture   override the frozen fixture path (testing)
  --baseline  override the baseline path (testing)

Grader is vendored at evals/grader; set TUJI_AUDIT_SKILL_ROOT to score with a skill
checkout instead (e.g. ${DEFAULT_SKILL_ROOT}).
Exit codes: 0 unchanged/improved, 1 regressed, 2 could not run or could not compare.`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText());
    return;
  }
  const base = TARGETS[options.target];
  const target = {
    ...base,
    fixture: options.fixture ?? base.fixture,
    baseline: options.baseline ?? base.baselineFor(options.source),
  };

  if (!fs.existsSync(target.grader)) {
    throw new Error(
      `grader not found: ${target.grader}\nSet TUJI_AUDIT_SKILL_ROOT to the directory holding the audit skills.`,
    );
  }
  if (!fs.existsSync(target.fixture)) {
    throw new Error(`fixture not found: ${target.fixture}`);
  }

  const report = runGrader(target, options.source);
  const current = {
    target: options.target,
    source: options.source,
    recordedAt: new Date().toISOString(),
    fixtureSha256: sha256(target.fixture),
    graderSha256: sha256(target.grader),
    score: scoreFrom(report, target),
  };

  const hasBaseline = fs.existsSync(target.baseline);
  const baseline = hasBaseline
    ? JSON.parse(fs.readFileSync(target.baseline, "utf8"))
    : null;
  const result = baseline
    ? compare(baseline, current)
    : { verdict: "no-baseline", notes: ["no baseline recorded yet"], newIssues: [], fixedIssues: [] };

  if (options.update) {
    fs.writeFileSync(target.baseline, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  }

  if (options.json) {
    console.log(JSON.stringify({ current, baseline, result, updated: options.update }, null, 2));
  } else {
    const s = current.score;
    console.log(`eval: ${options.target} (source: ${options.source})`);
    console.log(`fixture: ${displayPath(target.fixture)} (${current.fixtureSha256.slice(0, 12)})`);
    console.log(
      `scope: ${s.scope.words} words / ${s.scope.examples} examples${options.source === "fixture" ? " (frozen)" : " (live)"}`,
    );
    console.log(`tiers: mechanical=${s.tiers.mechanical} semantic=${s.tiers.semantic}`);
    console.log(`pass rate: ${(s.passRate * 100).toFixed(2)}%  (${s.failingWords} failing words, ${s.issueCount} issues)`);
    if (baseline) {
      console.log(`baseline: ${(baseline.score.passRate * 100).toFixed(2)}% recorded ${baseline.recordedAt}`);
    }
    console.log(`verdict: ${result.verdict}`);
    for (const note of result.notes) console.log(`  note: ${note}`);
    for (const key of result.newIssues) console.error(`  + ${key}`);
    for (const key of result.fixedIssues) console.log(`  - ${key} (fixed)`);
    if (options.update) console.log(`baseline written: ${displayPath(target.baseline)}`);
    else if (result.verdict === "improved") console.log("run with --update to record the improvement");
  }

  if (result.verdict === "regressed") process.exitCode = 1;
  else if (result.verdict === "incomparable" || (result.verdict === "no-baseline" && !options.update)) {
    process.exitCode = 2;
  }
}

// Only run when invoked directly; the pure comparison helpers above are imported by
// tests, and an import must not execute a grader.
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(`[tuji-eval] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
