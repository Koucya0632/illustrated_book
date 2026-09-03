import { createHash } from "node:crypto";

export type AudioLocale = "en-US" | "en-GB" | "ja-JP";

export interface AudioJob {
  wordId: string;
  locale: AudioLocale;
  text: string;
}

export interface AudioGenerationOptions {
  refresh: boolean;
  dryRun: boolean;
  limit: number | null;
  wordId: string | null;
  locale: AudioLocale | null;
}

export interface AudioArtifact {
  sha256: string;
  storagePath: string;
}

export const AUDIO_LOCALES = ["en-US", "en-GB", "ja-JP"] as const;
const AUDIO_LOCALE_SET = new Set<string>(AUDIO_LOCALES);
const VALUE_OPTIONS = new Set(["--limit", "--word-id", "--locale"]);
const FLAG_OPTIONS = new Set(["--refresh", "--dry-run"]);

function valueFor(argv: string[], name: string): string | null {
  const arg = argv.find((value) => value.startsWith(`${name}=`));
  return arg?.slice(name.length + 1).trim() || null;
}

export function parseAudioGenerationOptions(argv: string[]): AudioGenerationOptions {
  for (const arg of argv) {
    const name = arg.split("=", 1)[0];
    if (!VALUE_OPTIONS.has(name) && !FLAG_OPTIONS.has(arg)) {
      throw new Error(`unsupported option: ${arg}`);
    }
    if (VALUE_OPTIONS.has(name) && !arg.includes("=")) {
      throw new Error(`option requires a value: ${name}`);
    }
  }

  const rawLimit = valueFor(argv, "--limit");
  if (argv.some((arg) => arg.startsWith("--limit=")) && !rawLimit) {
    throw new Error("--limit must be a positive integer");
  }
  const parsedLimit = rawLimit === null ? null : Number(rawLimit);
  if (parsedLimit !== null && (!Number.isInteger(parsedLimit) || parsedLimit <= 0)) {
    throw new Error("--limit must be a positive integer");
  }

  const rawLocale = valueFor(argv, "--locale");
  if (rawLocale && !AUDIO_LOCALE_SET.has(rawLocale)) {
    throw new Error(`unsupported locale: ${rawLocale}`);
  }
  if (argv.some((arg) => arg.startsWith("--locale=")) && !rawLocale) {
    throw new Error("--locale requires a value");
  }

  const wordId = valueFor(argv, "--word-id");
  if (argv.some((arg) => arg.startsWith("--word-id=")) && !wordId) {
    throw new Error("--word-id requires a value");
  }

  return {
    refresh: argv.includes("--refresh"),
    dryRun: argv.includes("--dry-run"),
    limit: parsedLimit,
    wordId,
    locale: (rawLocale as AudioLocale | null) ?? null,
  };
}

export function buildAudioJobs(
  words: Array<{ id: string; word: string }>,
  jaTerms: Array<{ word_id: string; term: string }>,
): AudioJob[] {
  const jobs = new Map<string, AudioJob>();
  const add = (job: AudioJob) => {
    const key = `${job.wordId}|${job.locale}`;
    const prior = jobs.get(key);
    if (prior && prior.text !== job.text) {
      throw new Error(`conflicting audio text for ${key}`);
    }
    jobs.set(key, job);
  };

  for (const word of words) {
    const wordId = word.id.trim();
    const text = word.word.trim();
    if (!wordId || !text) continue;
    add({ wordId, locale: "en-US", text });
    add({ wordId, locale: "en-GB", text });
  }
  for (const term of jaTerms) {
    const wordId = term.word_id.trim();
    const text = term.term.trim();
    if (!wordId || !text) continue;
    add({ wordId, locale: "ja-JP", text });
  }
  return [...jobs.values()];
}

export function selectAudioJobs(
  jobs: AudioJob[],
  existing: Set<string>,
  options: AudioGenerationOptions,
): AudioJob[] {
  let selected = jobs.filter(
    (job) =>
      (!options.wordId || job.wordId === options.wordId) &&
      (!options.locale || job.locale === options.locale),
  );
  if (!options.refresh) {
    selected = selected.filter((job) => !existing.has(`${job.wordId}|${job.locale}`));
  }
  return options.limit ? selected.slice(0, options.limit) : selected;
}

export function assertAudioSelection(
  allJobs: AudioJob[],
  selectedJobs: AudioJob[],
  options: AudioGenerationOptions,
): void {
  if (!options.wordId) return;

  const wordJobs = allJobs.filter((job) => job.wordId === options.wordId);
  if (wordJobs.length === 0) {
    throw new Error(`no published audio job found for word id: ${options.wordId}`);
  }
  if (options.locale && !wordJobs.some((job) => job.locale === options.locale)) {
    throw new Error(`no ${options.locale} audio job found for word id: ${options.wordId}`);
  }
  if (options.refresh && selectedJobs.length === 0) {
    throw new Error(`targeted refresh selected no audio jobs for word id: ${options.wordId}`);
  }
}

export function buildAudioArtifact(job: AudioJob, mp3: Uint8Array): AudioArtifact {
  if (mp3.byteLength === 0) throw new Error("TTS response decoded to an empty MP3");
  const sha256 = createHash("sha256").update(mp3).digest("hex");
  return {
    sha256,
    storagePath: `${job.wordId}/${job.locale}/${sha256.slice(0, 20)}.mp3`,
  };
}

// ---------------------------------------------------------------------------
// Example-sentence clips (聽句)
//
// A second job type rather than a wider `AudioJob`, because the two are keyed
// on different things: a headword clip is one per (word, locale) and lives in
// `word_media`; a sentence clip is one per (example, locale) and lives in
// `word_example_media`. Forcing both through one type would mean an optional
// `exampleId` that half the code has to remember to check — and the cost of
// forgetting is a sentence filed as a word's pronunciation, which is exactly
// the failure docs/adr/0015 (iOS repo) exists to prevent.
// ---------------------------------------------------------------------------

export interface ExampleAudioJob {
  exampleId: number;
  locale: AudioLocale;
  text: string;
  /** For `--word-id` targeting and readable logs; not part of the key. */
  wordId: string;
}

export interface ExampleSentenceRow {
  id: number;
  word_id: string;
  /** `word_examples.sentence` — always the English source. */
  sentence: string;
  /** The ja translation from `word_example_translations`, when there is one. */
  ja: string | null;
}

/**
 * One job per (example, locale). English sentences get both accents, exactly as
 * headwords do — a learner who set 發音口音 to UK should not be handed an
 * American sentence next to a British word.
 */
export function buildExampleAudioJobs(rows: ExampleSentenceRow[]): ExampleAudioJob[] {
  const jobs: ExampleAudioJob[] = [];
  for (const row of rows) {
    const wordId = row.word_id.trim();
    const english = row.sentence?.trim() ?? "";
    if (wordId && english) {
      jobs.push({ exampleId: row.id, locale: "en-US", text: english, wordId });
      jobs.push({ exampleId: row.id, locale: "en-GB", text: english, wordId });
    }
    const japanese = row.ja?.trim() ?? "";
    if (wordId && japanese) {
      jobs.push({ exampleId: row.id, locale: "ja-JP", text: japanese, wordId });
    }
  }
  return jobs;
}

export function selectExampleAudioJobs(
  jobs: ExampleAudioJob[],
  existing: Set<string>,
  options: AudioGenerationOptions,
): ExampleAudioJob[] {
  let selected = jobs.filter(
    (job) =>
      (!options.wordId || job.wordId === options.wordId) &&
      (!options.locale || job.locale === options.locale),
  );
  if (!options.refresh) {
    selected = selected.filter((job) => !existing.has(`${job.exampleId}|${job.locale}`));
  }
  return options.limit ? selected.slice(0, options.limit) : selected;
}

/**
 * Storage path. Namespaced under `examples/` so a sentence clip can never
 * collide with the `<wordId>/<locale>/` tree the headword clips own — the same
 * separation the two tables make, carried into the bucket.
 */
export function buildExampleAudioArtifact(
  job: ExampleAudioJob,
  mp3: Uint8Array,
): AudioArtifact {
  if (mp3.byteLength === 0) throw new Error("TTS response decoded to an empty MP3");
  const sha256 = createHash("sha256").update(mp3).digest("hex");
  return {
    sha256,
    storagePath: `examples/${job.exampleId}/${job.locale}/${sha256.slice(0, 20)}.mp3`,
  };
}
