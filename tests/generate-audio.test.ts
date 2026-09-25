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

test("targeted refreshes use the current English headwords after street-word renames", () => {
  const renamedWords = [
    { id: "vendor", word: "market stall" },
    { id: "street-vendor", word: "food cart" },
    { id: "roadblock", word: "barricade" },
  ];
  const jobs = buildAudioJobs(renamedWords, []);

  for (const word of renamedWords) {
    const options = parseAudioGenerationOptions([
      "--refresh",
      `--word-id=${word.id}`,
    ]);
    assert.deepEqual(selectAudioJobs(jobs, new Set(), options), [
      { wordId: word.id, locale: "en-US", text: word.word },
      { wordId: word.id, locale: "en-GB", text: word.word },
    ]);
  }
});

test("generation options default to an idempotent live run", () => {
  assert.deepEqual(parseAudioGenerationOptions([]), {
    refresh: false,
    dryRun: false,
    limit: null,
    wordId: null,
    locale: null,
    speechText: null,
    headwordOnly: false,
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
      speechText: null,
      headwordOnly: false,
    },
  );
});

test("a Japanese pronunciation override stays scoped to one refreshed headword clip", () => {
  const options = parseAudioGenerationOptions([
    "--refresh",
    "--word-id=bathroom-cabinet",
    "--locale=ja-JP",
    "--headword-only",
    "--speech-text=せんめんじょのしゅうのうだな",
  ]);
  const jobs = buildAudioJobs([], [
    { word_id: "bathroom-cabinet", term: "洗面所の収納棚" },
  ]);

  assert.deepEqual(selectAudioJobs(jobs, new Set(), options), [
    { wordId: "bathroom-cabinet", locale: "ja-JP", text: "洗面所の収納棚" },
  ]);
  assert.doesNotThrow(() => assertAudioSelection(jobs, selectAudioJobs(jobs, new Set(), options), options));
});

test("generation options reject invalid or misspelled arguments", () => {
  assert.throws(() => parseAudioGenerationOptions(["--limit=0"]), /positive integer/);
  assert.throws(() => parseAudioGenerationOptions(["--limit=1.5"]), /positive integer/);
  assert.throws(() => parseAudioGenerationOptions(["--limit"]), /requires a value/);
  assert.throws(() => parseAudioGenerationOptions(["--locale=fr-FR"]), /unsupported locale/);
  assert.throws(() => parseAudioGenerationOptions(["--word-id="]), /requires a value/);
  assert.throws(() => parseAudioGenerationOptions(["--speech-text="]), /requires a value/);
  assert.throws(() => parseAudioGenerationOptions(["--refesh"]), /unsupported option/);
});

test("a pronunciation override cannot broaden its target or touch example clips", () => {
  const jobs = buildAudioJobs([], [
    { word_id: "bathroom-cabinet", term: "洗面所の収納棚" },
  ]);
  const wrongScope = parseAudioGenerationOptions([
    "--refresh",
    "--word-id=bathroom-cabinet",
    "--locale=ja-JP",
    "--speech-text=せんめんじょのしゅうのうだな",
  ]);

  assert.throws(() => assertAudioSelection(jobs, selectAudioJobs(jobs, new Set(), wrongScope), wrongScope), /headword-only/);
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
