import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const planPath = resolve(repoRoot, "output/alcoholic-drinks-audio-plan/manifest.json");
const generatedPath = resolve(
  repoRoot,
  "output/alcoholic-drinks-audio-candidates/generated-manifest.json",
);
const audioRoot = resolve(repoRoot, "output/alcoholic-drinks-audio-candidates");
const reportPath = resolve(audioRoot, "verification-report.json");

const plan = JSON.parse(readFileSync(planPath, "utf8"));
const manifest = JSON.parse(readFileSync(generatedPath, "utf8"));
const issues = [];
const durations = [];
const expectedKeys = new Set(
  plan.jobs.map((job) => `${job.kind}|${job.ownerKey}|${job.locale}`),
);
const generatedEntries = Object.entries(manifest.generated);

if (plan.series !== "alcoholic-drinks" || manifest.series !== "alcoholic-drinks") {
  issues.push("plan and generated manifest must both identify alcoholic-drinks");
}
if (plan.jobs.length !== 306) issues.push(`expected 306 planned clips, found ${plan.jobs.length}`);
if (generatedEntries.length !== 306) {
  issues.push(`expected 306 generated clips, found ${generatedEntries.length}`);
}
const failureCount = Array.isArray(manifest.failures)
  ? manifest.failures.length
  : Object.keys(manifest.failures ?? {}).length;
if (failureCount !== 0) issues.push(`generator recorded ${failureCount} failures`);

for (const [key, clip] of generatedEntries) {
  if (!expectedKeys.delete(key)) issues.push(`${key}: generated clip is not in the immutable plan`);
  const filePath = resolve(audioRoot, clip.file);
  if (!filePath.startsWith(`${audioRoot}/`)) {
    issues.push(`${key}: path escapes the candidate-audio directory`);
    continue;
  }
  let bytes;
  try {
    bytes = readFileSync(filePath);
  } catch (error) {
    issues.push(`${key}: cannot read ${clip.file}: ${error.message}`);
    continue;
  }
  const actualBytes = statSync(filePath).size;
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (actualBytes !== clip.bytes) issues.push(`${key}: byte count differs from manifest`);
  if (actualSha256 !== clip.sha256) issues.push(`${key}: SHA-256 differs from manifest`);
  if (bytes.subarray(0, 3).toString("ascii") !== "ID3" && bytes[0] !== 0xff) {
    issues.push(`${key}: file does not begin with an MP3 header or frame sync`);
  }

  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_name,duration",
      "-of",
      "json",
      filePath,
    ],
    { encoding: "utf8" },
  );
  if (probe.status !== 0) {
    issues.push(`${key}: ffprobe could not decode the file`);
    continue;
  }
  const stream = JSON.parse(probe.stdout).streams?.[0];
  const durationSeconds = Number(stream?.duration);
  if (stream?.codec_name !== "mp3") issues.push(`${key}: codec is not MP3`);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    issues.push(`${key}: duration is missing or non-positive`);
  } else {
    durations.push(durationSeconds);
  }
}

for (const key of expectedKeys) issues.push(`${key}: planned clip is missing`);

const count = (kind, locale) =>
  generatedEntries.filter(([, clip]) => clip.kind === kind && clip.locale === locale).length;
const breakdown = {
  headwords: {
    "en-US": count("headword", "en-US"),
    "en-GB": count("headword", "en-GB"),
    "ja-JP": count("headword", "ja-JP"),
  },
  examples: {
    "en-US": count("example", "en-US"),
    "en-GB": count("example", "en-GB"),
    "ja-JP": count("example", "ja-JP"),
  },
};

for (const [kind, expected] of [["headwords", 34], ["examples", 68]]) {
  for (const [locale, actual] of Object.entries(breakdown[kind])) {
    if (actual !== expected) issues.push(`${kind}/${locale}: expected ${expected}, found ${actual}`);
  }
}

const report = {
  schemaVersion: 1,
  series: "alcoholic-drinks",
  verifiedAt: new Date().toISOString(),
  sourceManifest: "generated-manifest.json",
  clipsVerified: generatedEntries.length,
  breakdown,
  durationSeconds: {
    minimum: Math.min(...durations),
    maximum: Math.max(...durations),
    total: durations.reduce((sum, value) => sum + value, 0),
  },
  checks: ["plan membership", "path containment", "byte count", "SHA-256", "MP3 header", "ffprobe decode"],
  issues,
  passed: issues.length === 0,
};

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (issues.length > 0) process.exitCode = 1;
