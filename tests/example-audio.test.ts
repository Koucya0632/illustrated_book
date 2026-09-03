import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExampleAudioArtifact,
  buildExampleAudioJobs,
  parseAudioGenerationOptions,
  selectExampleAudioJobs,
  type ExampleSentenceRow,
} from "../lib/audio-generation";

const rows: ExampleSentenceRow[] = [
  {
    id: 1,
    word_id: "air-conditioner",
    sentence: "The air conditioner is in the bedroom.",
    ja: "エアコンは寝室にあります。",
  },
  {
    id: 2,
    word_id: "air-conditioner",
    sentence: "Turn the air conditioner down before you leave the room.",
    ja: null,
  },
];

test("an English sentence is recorded in both accents, exactly as a headword is", () => {
  const jobs = buildExampleAudioJobs(rows);
  const forFirst = jobs.filter((job) => job.exampleId === 1).map((job) => job.locale);
  assert.deepEqual(forFirst.sort(), ["en-GB", "en-US", "ja-JP"]);
});

test("a sentence with no Japanese translation yields no ja-JP clip", () => {
  const jobs = buildExampleAudioJobs(rows);
  const forSecond = jobs.filter((job) => job.exampleId === 2).map((job) => job.locale);
  assert.deepEqual(forSecond.sort(), ["en-GB", "en-US"]);
});

test("the ja-JP job speaks the translation, not the English source", () => {
  const jobs = buildExampleAudioJobs(rows);
  const ja = jobs.find((job) => job.locale === "ja-JP");
  assert.equal(ja?.text, "エアコンは寝室にあります。");
});

test("a re-run skips (example, locale) pairs that already have a clip", () => {
  const jobs = buildExampleAudioJobs(rows);
  const existing = new Set(["1|en-US", "1|en-GB", "1|ja-JP"]);
  const selected = selectExampleAudioJobs(jobs, existing, parseAudioGenerationOptions([]));
  assert.deepEqual(
    selected.map((job) => `${job.exampleId}|${job.locale}`),
    ["2|en-US", "2|en-GB"],
  );
});

test("--refresh regenerates even what is already recorded", () => {
  const jobs = buildExampleAudioJobs(rows);
  const existing = new Set(["1|en-US", "1|en-GB", "1|ja-JP", "2|en-US", "2|en-GB"]);
  const selected = selectExampleAudioJobs(
    jobs,
    existing,
    parseAudioGenerationOptions(["--refresh"]),
  );
  assert.equal(selected.length, 5);
});

// The whole point of the separate table (docs/adr/0015 in the iOS repo) is that
// a sentence clip can never be mistaken for a word's pronunciation. The storage
// tree has to keep the same separation, or the bucket re-introduces by path
// what the schema separated by key.
test("example clips live under their own storage prefix, never a word's", () => {
  const [job] = buildExampleAudioJobs(rows);
  const artifact = buildExampleAudioArtifact(job, Buffer.from("not-really-an-mp3"));
  assert.ok(artifact.storagePath.startsWith("examples/1/en-US/"));
  assert.ok(!artifact.storagePath.startsWith("air-conditioner/"));
});

test("an empty synthesis result is refused rather than filed", () => {
  const [job] = buildExampleAudioJobs(rows);
  assert.throws(() => buildExampleAudioArtifact(job, new Uint8Array()), /empty MP3/);
});
