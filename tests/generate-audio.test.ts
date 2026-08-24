import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAudioSelection,
  buildAudioArtifact,
  buildAudioJobs,
  parseAudioGenerationOptions,
  selectAudioJobs,
} from "../lib/audio-generation";

test("a targeted refresh regenerates only access-card's current Japanese term", () => {
  const options = parseAudioGenerationOptions([
    "--refresh",
    "--word-id=access-card",
    "--locale=ja-JP",
  ]);
  const jobs = buildAudioJobs(
    [
      { id: "access-card", word: "access card" },
      { id: "paper", word: "paper" },
    ],
    [
      { word_id: "access-card", term: "入館カード" },
      { word_id: "paper", term: "紙" },
    ],
  );

  assert.deepEqual(
    selectAudioJobs(jobs, new Set(["access-card|ja-JP"]), options),
    [{ wordId: "access-card", locale: "ja-JP", text: "入館カード" }],
  );
});

test("generation options default to an idempotent live run", () => {
  assert.deepEqual(parseAudioGenerationOptions([]), {
    refresh: false,
    dryRun: false,
    limit: null,
    wordId: null,
    locale: null,
  });
});

test("generation options parse a safe targeted dry run", () => {
  assert.deepEqual(
    parseAudioGenerationOptions([
      "--dry-run",
      "--refresh",
      "--limit=1",
      "--word-id=access-card",
      "--locale=ja-JP",
    ]),
    {
      refresh: true,
      dryRun: true,
      limit: 1,
      wordId: "access-card",
      locale: "ja-JP",
    },
  );
});

test("generation options reject invalid or misspelled arguments", () => {
  assert.throws(() => parseAudioGenerationOptions(["--limit=0"]), /positive integer/);
  assert.throws(() => parseAudioGenerationOptions(["--limit=1.5"]), /positive integer/);
  assert.throws(() => parseAudioGenerationOptions(["--limit"]), /requires a value/);
  assert.throws(() => parseAudioGenerationOptions(["--locale=fr-FR"]), /unsupported locale/);
  assert.throws(() => parseAudioGenerationOptions(["--word-id="]), /requires a value/);
  assert.throws(() => parseAudioGenerationOptions(["--refesh"]), /unsupported option/);
});

test("buildAudioJobs trims values, omits blanks, and de-duplicates identical jobs", () => {
  assert.deepEqual(
    buildAudioJobs(
      [
        { id: " paper ", word: " paper " },
        { id: "blank", word: "   " },
      ],
      [
        { word_id: "paper", term: " 紙 " },
        { word_id: "paper", term: "紙" },
        { word_id: "blank", term: "" },
      ],
    ),
    [
      { wordId: "paper", locale: "en-US", text: "paper" },
      { wordId: "paper", locale: "en-GB", text: "paper" },
      { wordId: "paper", locale: "ja-JP", text: "紙" },
    ],
  );
});

test("buildAudioJobs rejects conflicting text for one word and locale", () => {
  assert.throws(
    () =>
      buildAudioJobs([], [
        { word_id: "paper", term: "紙" },
        { word_id: "paper", term: "用紙" },
      ]),
    /conflicting audio text/,
  );
});

test("selectAudioJobs skips existing clips unless refresh is requested", () => {
  const jobs = buildAudioJobs([{ id: "paper", word: "paper" }], [
    { word_id: "paper", term: "紙" },
  ]);
  const existing = new Set(["paper|en-US", "paper|ja-JP"]);

  assert.deepEqual(
    selectAudioJobs(jobs, existing, parseAudioGenerationOptions([])),
    [{ wordId: "paper", locale: "en-GB", text: "paper" }],
  );
  assert.equal(
    selectAudioJobs(jobs, existing, parseAudioGenerationOptions(["--refresh"])).length,
    3,
  );
});

test("target validation catches unknown words and missing locale jobs", () => {
  const jobs = buildAudioJobs([{ id: "paper", word: "paper" }], []);

  assert.throws(
    () =>
      assertAudioSelection(
        jobs,
        [],
        parseAudioGenerationOptions(["--refresh", "--word-id=missing"]),
      ),
    /no published audio job/,
  );
  assert.throws(
    () =>
      assertAudioSelection(
        jobs,
        [],
        parseAudioGenerationOptions([
          "--refresh",
          "--word-id=paper",
          "--locale=ja-JP",
        ]),
      ),
    /no ja-JP audio job/,
  );
});

test("audio artifacts use immutable content-addressed paths", () => {
  const job = { wordId: "access-card", locale: "ja-JP" as const, text: "入館カード" };
  const first = buildAudioArtifact(job, Buffer.from("mp3-one"));
  const same = buildAudioArtifact(job, Buffer.from("mp3-one"));
  const changed = buildAudioArtifact(job, Buffer.from("mp3-two"));

  assert.deepEqual(first, same);
  assert.notEqual(first.storagePath, changed.storagePath);
  assert.match(first.storagePath, /^access-card\/ja-JP\/[a-f0-9]{20}\.mp3$/);
  assert.throws(() => buildAudioArtifact(job, Buffer.alloc(0)), /empty MP3/);
});
