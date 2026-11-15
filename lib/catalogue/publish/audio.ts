// Candidate audio for a release: plan the clips, generate them with Google
// Chirp 3 HD, then verify every file (bytes, hashes, full MP3 decode). Ported
// from the per-release plan-/generate-/verify-*-audio scripts.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { ReleasePublishDescriptor } from "./descriptor";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Job = {
  kind: "headword" | "example";
  ownerKey: string;
  wordId: string;
  slot?: number;
  locale: "en-US" | "en-GB" | "ja-JP";
  text: string;
};

const keyFor = (job: { kind: string; ownerKey: string; locale: string }) =>
  `${job.kind}|${job.ownerKey}|${job.locale}`;

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(`${file}.tmp`, file);
}

/** Nine clips per word: the headword and both examples, in en-US, en-GB, ja-JP. */
export function planReleaseAudio(descriptor: ReleasePublishDescriptor, root: string) {
  const entries: any[] = JSON.parse(
    fs.readFileSync(path.join(root, descriptor.files.candidates), "utf8"),
  ).entries;
  const jobs: Job[] = [];
  for (const entry of entries) {
    jobs.push(
      { kind: "headword", ownerKey: entry.id, wordId: entry.id, locale: "en-US", text: entry.word },
      { kind: "headword", ownerKey: entry.id, wordId: entry.id, locale: "en-GB", text: entry.word },
      { kind: "headword", ownerKey: entry.id, wordId: entry.id, locale: "ja-JP", text: entry.ja },
    );
    entry.examples.forEach((example: any, index: number) => {
      const ownerKey = `${entry.id}:${index}`;
      jobs.push(
        { kind: "example", ownerKey, wordId: entry.id, slot: index, locale: "en-US", text: example.en },
        { kind: "example", ownerKey, wordId: entry.id, slot: index, locale: "en-GB", text: example.en },
        { kind: "example", ownerKey, wordId: entry.id, slot: index, locale: "ja-JP", text: example.ja },
      );
    });
  }
  const issues: string[] = [];
  if (!entries.length) issues.push("candidate series is empty");
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) issues.push("duplicate word IDs");
  for (const entry of entries) {
    if (!entry.word?.trim() || !entry.ja?.trim()) issues.push(`${entry.id}: missing headword source text`);
    if (!Array.isArray(entry.examples) || entry.examples.length !== 2) issues.push(`${entry.id}: expected two examples`);
  }
  if (new Set(jobs.map(keyFor)).size !== jobs.length) issues.push("duplicate audio owner/locale jobs");
  const expectedJobs = entries.reduce((total, entry) => total + 3 + 3 * (entry.examples?.length ?? 0), 0);
  if (jobs.length !== expectedJobs) issues.push(`expected ${expectedJobs} jobs, found ${jobs.length}`);
  const count = (kind: string, locale: string) =>
    jobs.filter((job) => job.kind === kind && job.locale === locale).length;
  const manifest = {
    schemaVersion: 1,
    series: descriptor.series,
    state: issues.length ? "invalid" : "candidate-audio-planned",
    productionWriteAllowed: false,
    note: "Example ownerKey values are candidate references, not production example IDs. Reserve actual Postgres IDs and persist the mapping in the apply manifest before constructing example-audio upload paths.",
    summary: {
      words: entries.length,
      examples: entries.reduce((total, entry) => total + (entry.examples?.length ?? 0), 0),
      clips: jobs.length,
      headwords: {
        total: jobs.filter((job) => job.kind === "headword").length,
        "en-US": count("headword", "en-US"),
        "en-GB": count("headword", "en-GB"),
        "ja-JP": count("headword", "ja-JP"),
      },
      examplesByLocale: {
        total: jobs.filter((job) => job.kind === "example").length,
        "en-US": count("example", "en-US"),
        "en-GB": count("example", "en-GB"),
        "ja-JP": count("example", "ja-JP"),
      },
    },
    issues,
    jobs,
  };
  writeJson(path.join(root, descriptor.files.audioPlan), manifest);
  return manifest;
}

const looksLikeMp3 = (bytes: Buffer) =>
  bytes.length > 256 &&
  (bytes.subarray(0, 3).toString("ascii") === "ID3" ||
    bytes.subarray(0, 4096).some((value, i, a) => value === 0xff && i + 1 < a.length && (a[i + 1] & 0xe0) === 0xe0));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Synthesize every planned clip that is missing or stale. Resumable: the
 * generated manifest is rewritten after each clip. */
export async function generateReleaseAudio(
  descriptor: ReleasePublishDescriptor,
  root: string,
  options: { apiKey: string; voice: string; limit?: number | null; log?: (line: string) => void },
) {
  const log = options.log ?? console.log;
  const plan = JSON.parse(fs.readFileSync(path.join(root, descriptor.files.audioPlan), "utf8"));
  if (plan.state !== "candidate-audio-planned" || plan.issues?.length) throw new Error("audio plan is not valid");
  const outputRoot = path.join(root, descriptor.audioDirectory);
  const statusFile = path.join(root, descriptor.files.audio);
  fs.mkdirSync(outputRoot, { recursive: true });
  const status = fs.existsSync(statusFile)
    ? JSON.parse(fs.readFileSync(statusFile, "utf8"))
    : { schemaVersion: 1, series: descriptor.series, voice: options.voice, generated: {}, failures: {} };
  const save = () => writeJson(statusFile, status);

  async function synthesize(job: Job): Promise<Buffer> {
    const body = {
      input: { text: job.text },
      voice: { languageCode: job.locale, name: `${job.locale}-Chirp3-HD-${status.voice}` },
      audioConfig: { audioEncoding: "MP3" },
    };
    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${options.apiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      if (response.ok) {
        const json = await response.json();
        const bytes = Buffer.from(json.audioContent || "", "base64");
        if (!looksLikeMp3(bytes)) throw new Error("TTS response is not a valid-looking MP3");
        return bytes;
      }
      const detail = (await response.text().catch(() => "")).slice(0, 180);
      if (attempt === 3 || ![429, 500, 502, 503, 504].includes(response.status)) {
        throw new Error(`TTS HTTP ${response.status}: ${detail}`);
      }
      await wait(attempt * 5000);
    }
    throw new Error("unreachable");
  }

  let generated = 0, skipped = 0, failed = 0;
  const selected: Job[] = options.limit ? plan.jobs.slice(0, options.limit) : plan.jobs;
  for (const [index, job] of selected.entries()) {
    const key = keyFor(job);
    const sourceDigest = crypto.createHash("sha256").update(`${job.locale}\0${job.text}`).digest("hex");
    const relativePath = path.join(job.kind, job.locale, `${sourceDigest}.mp3`);
    const absolutePath = path.join(outputRoot, relativePath);
    const previous = status.generated[key];
    if (previous?.sourceText === job.text && fs.existsSync(absolutePath) && looksLikeMp3(fs.readFileSync(absolutePath))) {
      skipped++;
      continue;
    }
    try {
      const bytes = await synthesize(job);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, bytes);
      status.generated[key] = {
        ...job,
        file: relativePath,
        bytes: bytes.length,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        sourceText: job.text,
      };
      delete status.failures[key];
      generated++;
      save();
      log(`[${index + 1}/${selected.length}] generated ${key}`);
      await wait(150);
    } catch (error) {
      failed++;
      status.failures[key] = error instanceof Error ? error.message : String(error);
      save();
      log(`[${index + 1}/${selected.length}] failed ${key}: ${status.failures[key]}`);
    }
  }
  status.summary = {
    planned: plan.jobs.length,
    present: Object.keys(status.generated).length,
    failures: Object.keys(status.failures).length,
    generatedThisRun: generated,
    skippedThisRun: skipped,
  };
  save();
  return { summary: status.summary, failed };
}

/** Check every generated clip against the plan and decode it fully with
 * ffprobe/ffmpeg. Writes the verification report and the MP3 frame report
 * the plan preparer requires. */
export function verifyReleaseAudio(descriptor: ReleasePublishDescriptor, root: string) {
  const plan = JSON.parse(fs.readFileSync(path.join(root, descriptor.files.audioPlan), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, descriptor.files.audio), "utf8"));
  const audioRoot = path.resolve(root, descriptor.audioDirectory);
  const issues: string[] = [];
  const durations: number[] = [];
  const frames: { key: string; valid: boolean; frames: number }[] = [];
  const expectedKeys = new Set<string>(plan.jobs.map(keyFor));
  const jobByKey = new Map<string, Job>(plan.jobs.map((job: Job) => [keyFor(job), job]));
  const generatedEntries = Object.entries(manifest.generated) as [string, any][];

  if (plan.series !== descriptor.series || manifest.series !== descriptor.series) {
    issues.push(`plan and generated manifest must both identify ${descriptor.series}`);
  }
  if (generatedEntries.length !== plan.jobs.length) issues.push(`planned ${plan.jobs.length} clips, found ${generatedEntries.length}`);
  const failureCount = Array.isArray(manifest.failures) ? manifest.failures.length : Object.keys(manifest.failures ?? {}).length;
  if (failureCount !== 0) issues.push(`generator recorded ${failureCount} failures`);

  for (const [key, clip] of generatedEntries) {
    if (!expectedKeys.delete(key)) issues.push(`${key}: generated clip is not in the plan`);
    const job = jobByKey.get(key);
    if (job && (clip.sourceText !== job.text || clip.locale !== job.locale ||
        clip.kind !== job.kind || clip.ownerKey !== job.ownerKey ||
        clip.wordId !== job.wordId || clip.slot !== job.slot)) {
      issues.push(`${key}: spoken text or owner metadata differs from the current plan`);
    }
    const filePath = path.resolve(audioRoot, clip.file);
    if (!filePath.startsWith(`${audioRoot}${path.sep}`)) {
      issues.push(`${key}: path escapes the candidate-audio directory`);
      continue;
    }
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(filePath);
    } catch (error) {
      issues.push(`${key}: cannot read ${clip.file}: ${(error as Error).message}`);
      continue;
    }
    if (bytes.length !== clip.bytes) issues.push(`${key}: byte count differs from manifest`);
    if (crypto.createHash("sha256").update(bytes).digest("hex") !== clip.sha256) issues.push(`${key}: SHA-256 differs from manifest`);
    if (bytes.subarray(0, 3).toString("ascii") !== "ID3" && bytes[0] !== 0xff) {
      issues.push(`${key}: file does not begin with an MP3 header or frame sync`);
    }
    const probe = spawnSync(
      "ffprobe",
      ["-v", "error", "-select_streams", "a:0", "-count_frames", "-show_entries", "stream=codec_name,duration,nb_read_frames", "-of", "json", filePath],
      { encoding: "utf8" },
    );
    if (probe.status !== 0) {
      issues.push(`${key}: ffprobe could not decode the file`);
      frames.push({ key, valid: false, frames: 0 });
      continue;
    }
    const stream = JSON.parse(probe.stdout).streams?.[0];
    const durationSeconds = Number(stream?.duration);
    if (stream?.codec_name !== "mp3") issues.push(`${key}: codec is not MP3`);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) issues.push(`${key}: duration is missing or non-positive`);
    else durations.push(durationSeconds);
    const decode = spawnSync("ffmpeg", ["-v", "error", "-xerror", "-i", filePath, "-f", "null", "-"], { encoding: "utf8" });
    if (decode.status !== 0) issues.push(`${key}: full MP3 frame decode failed: ${decode.stderr.trim()}`);
    const frameCount = Number(stream?.nb_read_frames ?? 0);
    frames.push({ key, valid: decode.status === 0 && stream?.codec_name === "mp3" && frameCount > 0, frames: frameCount });
  }
  for (const key of expectedKeys) issues.push(`${key}: planned clip is missing`);

  const count = (kind: string, locale: string) =>
    generatedEntries.filter(([, clip]) => clip.kind === kind && clip.locale === locale).length;
  const breakdown = {
    headwords: { "en-US": count("headword", "en-US"), "en-GB": count("headword", "en-GB"), "ja-JP": count("headword", "ja-JP") },
    examples: { "en-US": count("example", "en-US"), "en-GB": count("example", "en-GB"), "ja-JP": count("example", "ja-JP") },
  };
  for (const [kind, expected] of [["headwords", plan.summary.words], ["examples", plan.summary.examples]] as const) {
    for (const [locale, actual] of Object.entries(breakdown[kind])) {
      if (actual !== expected) issues.push(`${kind}/${locale}: expected ${expected}, found ${actual}`);
    }
  }
  const report = {
    schemaVersion: 1,
    series: descriptor.series,
    verifiedAt: new Date().toISOString(),
    sourceManifest: "generated-manifest.json",
    clipsVerified: generatedEntries.length,
    breakdown,
    durationSeconds: {
      minimum: Math.min(...durations),
      maximum: Math.max(...durations),
      total: durations.reduce((sum, value) => sum + value, 0),
    },
    checks: ["plan membership", "exact spoken source and owner", "path containment", "byte count", "SHA-256", "MP3 header", "ffprobe metadata", "full ffmpeg decode"],
    issues,
    passed: issues.length === 0,
  };
  writeJson(path.join(root, descriptor.files.audioVerification), report);
  writeJson(path.join(root, descriptor.files.audioFrameVerification), {
    schemaVersion: 1,
    series: descriptor.series,
    verifiedAt: report.verifiedAt,
    clips: frames.length,
    results: frames,
    passed: issues.length === 0 && frames.length === plan.jobs.length && frames.every(({ valid }) => valid),
  });
  return report;
}
