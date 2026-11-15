// Read-only preparation of a publish plan: it checks every reviewed input,
// pins their hashes (and the publisher's own code), maps media to
// content-addressed Storage paths, and optionally records a SELECT-only
// database preflight. It uploads nothing and writes no database row.
//
// Ported from scripts/prepare-dental-clinic-publish-plan.mjs; the topic and
// file paths come from the release descriptor.

import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import sharp from "sharp";
import type { ReleasePublishDescriptor } from "./descriptor";
import {
  digest,
  PUBLISHER_SOURCES,
  publisherSourceKey,
  sha256,
  type PublishPlan,
} from "./plan";

type Sql = ReturnType<typeof postgres>;
/* eslint-disable @typescript-eslint/no-explicit-any */

const locales = ["en-US", "en-GB", "ja-JP"] as const;
const invariant = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

export type PrepareOptions = {
  root: string;
  /** Recorded in the plan; an apply must run against the same target. */
  storageTarget: { fingerprint: string } & Record<string, unknown>;
  /** SELECT-only preflight against the target database, when given. */
  database?: { sql: Sql; hostFingerprint: string } | null;
};

export async function prepareReleasePlan(
  descriptor: ReleasePublishDescriptor,
  options: PrepareOptions,
): Promise<PublishPlan> {
  const { root } = options;
  const series = descriptor.series;
  const read = (relative: string) => fs.readFileSync(path.join(root, relative));
  const json = (relative: string) => JSON.parse(read(relative).toString("utf8"));
  const audioRoot = path.join(root, descriptor.audioDirectory);

  const verifiedFile = (meta: any) => {
    invariant(typeof meta.localFile === "string" && !path.isAbsolute(meta.localFile), "invalid local media path");
    const full = path.resolve(root, meta.localFile);
    invariant(full.startsWith(`${root}${path.sep}`), `${meta.localFile}: escapes repository`);
    const bytes = fs.readFileSync(full);
    invariant(bytes.length === meta.bytes && sha256(bytes) === meta.contentSha256, `${meta.localFile}: bytes changed`);
    return meta;
  };

  const sourceFiles: Record<string, string> = {
    ...descriptor.files,
    ...Object.fromEntries(PUBLISHER_SOURCES.map((file) => [publisherSourceKey(file), file])),
  };
  const sources = Object.fromEntries(
    Object.entries(sourceFiles).map(([key, relative]) => [key, { file: relative, sha256: sha256(read(relative)) }]),
  );
  const candidate = json(descriptor.files.candidates);
  const entries: any[] = candidate.entries;
  const canonicalImages = json(descriptor.files.canonicalImages);
  const spans = json(descriptor.files.spans);
  const images = json(descriptor.files.images);
  const visual = json(descriptor.files.visualReview);
  const semantic = json(descriptor.files.semanticReview);
  const audioPlan = json(descriptor.files.audioPlan);
  const audioManifest = json(descriptor.files.audio);
  const audioVerification = json(descriptor.files.audioVerification);
  const audioFrames = json(descriptor.files.audioFrameVerification);

  invariant(candidate.category?.id === series, `candidate topic is not ${series}`);
  invariant(entries.length > 0 && new Set(entries.map(({ id }) => id)).size === entries.length, "expected nonempty unique candidate IDs");
  invariant(entries.every((entry) => canonicalImages[entry.id] === entry.imageUrl), "canonical image URLs differ from candidate URLs");
  invariant(entries.every(({ category, examples }) => category === series && examples.length === 2 && examples[0].cefrLevel === "A2" && examples[1].cefrLevel === "B1"), "category or example contract mismatch");
  invariant(visual.summary.passedWordImages === entries.length && visual.summary.failedWordImages === 0 && visual.summary.passedCategoryImages === 1, "visual review incomplete");
  invariant(semantic.summary.passed === entries.length * 3 && semantic.summary.failed === 0, "semantic review incomplete");
  invariant(audioVerification.passed && audioVerification.clipsVerified === audioPlan.jobs.length, "audio verification incomplete");
  invariant(audioFrames.passed && audioFrames.clips === audioPlan.jobs.length && audioFrames.results.every((result: any) => result.valid && result.frames > 0), "complete MP3 frame verification incomplete");
  invariant(images.images.length === entries.length, "word-image count mismatch");
  const imageById = new Map<string, any>(images.images.map((image: any) => [image.id, image]));
  invariant(imageById.size === entries.length, "image IDs are not unique");
  const reviewImages = [...images.images, images.categoryImage];
  invariant(visual.reviews.length === reviewImages.length, "visual review item count mismatch");
  const visualById = new Map<string, any>(visual.reviews.map((review: any) => [review.id, review]));
  invariant(visualById.size === reviewImages.length, "visual review IDs are not unique");
  for (const image of reviewImages) {
    const review = visualById.get(image.id);
    invariant(review?.decision === "pass" && review.localFile === image.localFile && review.contentSha256 === image.contentSha256 && review.reason?.trim(), `${image.id}: visual review does not match selected image`);
  }
  invariant(semantic.items.length === entries.length * 3, "semantic review item count mismatch");
  const semanticById = new Map<string, any>(semantic.items.map((review: any) => [review.id, review]));
  invariant(semanticById.size === semantic.items.length, "semantic review IDs are not unique");
  for (const entry of entries) {
    const wordReview = semanticById.get(entry.id);
    invariant(wordReview?.kind === "word" && wordReview.verdict === "pass" && wordReview.reason?.trim() &&
      wordReview.headwords.en === entry.word && wordReview.headwords.ja === entry.ja && wordReview.headwords.zh === entry.chinese,
    `${entry.id}: word review is missing or stale`);
    invariant(wordReview.sourceSha256 === sha256(JSON.stringify({
      en: entry.word, ja: entry.ja, zh: entry.chinese,
      reading: entry.jaReading, definitions: entry.definitions,
    })), `${entry.id}: word review source digest is stale`);
    for (const [slot, example] of entry.examples.entries()) {
      const review = semanticById.get(`${entry.id}:${slot}`);
      invariant(review?.kind === "example" && review.verdict === "pass" && review.reason?.trim() &&
        review.cefrLevel === example.cefrLevel && ["en", "ja", "zh"].every((language) => review.text[language] === example[language]),
      `${entry.id}:${slot}: example review is missing or stale`);
      invariant(review.sourceSha256 === sha256(JSON.stringify({
        example,
        englishSpans: spans.en[example.en],
        japaneseSpans: spans.ja[example.ja],
      })), `${entry.id}:${slot}: example review source digest is stale`);
    }
  }
  const storagePaths = new Set<string>();
  const addPath = (bucket: string, storagePath: string) => {
    const key = `${bucket}/${storagePath}`;
    invariant(!storagePaths.has(key), `duplicate storage object: ${key}`);
    storagePaths.add(key);
  };
  const categoryImage = verifiedFile(images.categoryImage);
  addPath(categoryImage.bucket, categoryImage.storagePath);
  const usedAudio = new Set<string>();
  const mapAudio = (entry: any, kind: "headword" | "example", slot: number | null, locale: string) => {
    const ownerKey = kind === "headword" ? entry.id : `${entry.id}:${slot}`;
    const key = `${kind}|${ownerKey}|${locale}`;
    const clip = audioManifest.generated[key];
    const expectedText = kind === "headword" ? (locale === "ja-JP" ? entry.ja : entry.word)
      : (locale === "ja-JP" ? entry.examples[slot!].ja : entry.examples[slot!].en);
    invariant(clip && clip.text === expectedText && clip.sourceText === expectedText, `${key}: missing or stale audio text`);
    invariant(!usedAudio.has(key), `${key}: duplicate owner-locale`);
    usedAudio.add(key);
    const full = path.resolve(audioRoot, clip.file);
    invariant(full.startsWith(`${audioRoot}${path.sep}`), `${key}: invalid audio path`);
    const bytes = fs.readFileSync(full);
    invariant(bytes.length === clip.bytes && sha256(bytes) === clip.sha256, `${key}: audio bytes changed`);
    const storagePath = kind === "headword"
      ? `${entry.id}/${locale}/${clip.sha256.slice(0, 20)}.mp3`
      : `examples/{exampleId}/${locale}/${clip.sha256.slice(0, 20)}.mp3`;
    if (kind === "headword") addPath("word-audio", storagePath);
    return {
      kind, ownerKey, wordId: entry.id, ...(slot === null ? {} : { slot, sortOrder: slot }), locale,
      sourceText: expectedText, sourceLanguage: locale === "ja-JP" ? "ja" : "en",
      sourceDigest: sha256(`${locale}\0${expectedText}`),
      localFile: path.relative(root, full).split(path.sep).join("/"), bytes: clip.bytes,
      contentSha256: clip.sha256, mimeType: "audio/mpeg", model: "chirp-3-hd",
      voice: `${locale}-Chirp3-HD-${audioManifest.voice}`, bucket: "word-audio", storagePath,
      uploadRequired: true,
    };
  };
  const mapped = entries.map((entry) => {
    const image = imageById.get(entry.id);
    invariant(image && image.url === entry.imageUrl, `${entry.id}: image URL differs from candidate`);
    verifiedFile(image);
    addPath(image.bucket, image.storagePath);
    const examples = entry.examples.map((example: any, slot: number) => {
      const en = spans.en[example.en], ja = spans.ja[example.ja];
      invariant(en && en.map(({ t }: any) => t).join("") === example.en, `${entry.id}:${slot}: English spans changed`);
      invariant(ja && ja.map(({ t }: any) => t).join("") === example.ja, `${entry.id}:${slot}: Japanese spans changed`);
      const audio = locales.map((locale) => mapAudio(entry, "example", slot, locale));
      return { ownerKey: `${entry.id}:${slot}`, sortOrder: slot, ...example, spans: { en, ja }, audio };
    });
    const headwordAudio = locales.map((locale) => mapAudio(entry, "headword", null, locale));
    return { operation: "insert", contentDigest: digest(entry), word: entry, image: { ...image, uploadRequired: true }, headwordAudio, examples };
  });
  for (const image of [...images.images, categoryImage]) {
    const bytes = read(image.localFile);
    invariant(bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP", `${image.id}: invalid WebP container`);
    const metadata = await sharp(bytes).metadata();
    invariant(metadata.format === "webp" && metadata.width === image.width && metadata.height === image.height && metadata.width >= 512 && metadata.height >= 512, `${image.id}: WebP dimensions or format mismatch`);
  }
  invariant(usedAudio.size === audioPlan.jobs.length && Object.keys(audioManifest.generated).length === usedAudio.size, "audio plan/manifest owner coverage mismatch");
  const db = options.database ? await databasePreflight(options.database.sql, options.database.hostFingerprint, series, entries) : null;
  const content = {
    schemaVersion: 1, series, release: descriptor.release, productionWriteAllowed: false,
    releaseShape: { insertWordIds: entries.map(({ id }) => id), updateWordIds: [] },
    category: {
      ...candidate.category,
      imageUrl: categoryImage.url,
      image: { ...categoryImage, uploadRequired: true },
    },
    sources, entries: mapped,
    summary: {
      words: entries.length, definitions: entries.reduce((n, entry) => n + entry.definitions.length, 0),
      examples: entries.length * 2, spanSentences: entries.length * 4,
      wordImages: entries.length, categoryImages: 1, audioClips: usedAudio.size,
      storageObjects: entries.length + 1 + usedAudio.size,
    },
    applyContract: [
      "repeat SELECT-only preflight and match its database/Storage target fingerprints",
      "resolve Postgres example IDs and persist their owner-key mapping before constructing example audio paths",
      "create absent content-addressed objects only, then download and hash all remote bytes",
      "insert all content and publish every word in one database transaction",
      "verify database, media, API, routes, and ordinary/cache-busting responses",
    ],
  };
  return {
    ...content, planDigest: digest(content), createdAt: new Date().toISOString(),
    status: db && !db.readyForGuardedApply ? "prepared-with-preflight-conflicts" : "prepared",
    databasePreflight: db, storageTarget: options.storageTarget,
  };
}

/** Write `publish-plan.json` and its immutable `publish-plan-<sha256>.json`
 * copy into the release's prep directory. */
export function writePublishPlan(descriptor: ReleasePublishDescriptor, plan: PublishPlan, root: string) {
  const directory = path.join(root, descriptor.prepDirectory);
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "publish-plan.json");
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(plan, null, 2)}\n`);
  fs.renameSync(`${file}.tmp`, file);
  const bytes = fs.readFileSync(file);
  const immutableFile = path.join(directory, `publish-plan-${sha256(bytes)}.json`);
  fs.writeFileSync(immutableFile, bytes, { flag: "wx" });
  return { file, immutableFile };
}

async function databasePreflight(sql: Sql, hostFingerprint: string, series: string, entries: any[]) {
  const ids = entries.map(({ id }) => id);
  const words = entries.map(({ word }) => word.toLowerCase());
  const english = entries.flatMap(({ examples }) => examples.map(({ en }: any) => en));
  const japanese = entries.flatMap(({ examples }) => examples.map(({ ja }: any) => ja));
  return sql.begin("read only", async (tx) => {
    const [identity] = await tx`SELECT current_database() AS database_name, current_user AS database_user`;
    const [tables] = await tx`SELECT
      to_regclass('public.words')::text AS words,
      to_regclass('public.categories')::text AS categories,
      to_regclass('public.category_translations')::text AS category_translations,
      to_regclass('public.word_terms')::text AS word_terms,
      to_regclass('public.word_definitions')::text AS word_definitions,
      to_regclass('public.word_examples')::text AS word_examples,
      to_regclass('public.word_example_translations')::text AS word_example_translations,
      to_regclass('public.sentence_spans')::text AS sentence_spans,
      to_regclass('public.sentence_span_glosses')::text AS sentence_span_glosses,
      to_regclass('public.word_relations')::text AS word_relations,
      to_regclass('public.word_categories')::text AS word_categories,
      to_regclass('public.word_media')::text AS word_media,
      to_regclass('public.word_example_media')::text AS word_example_media,
      to_regclass('public.cards')::text AS cards`;
    const candidateRows = await tx`SELECT id, word, category, status FROM words WHERE id = ANY(${ids}) ORDER BY id`;
    const headwordConflicts = await tx`SELECT id, word, category, status FROM words WHERE lower(word) = ANY(${words}) AND NOT (id = ANY(${ids})) ORDER BY id`;
    const japaneseConflicts = await tx`SELECT w.id, t.term FROM words w JOIN word_terms t ON t.word_id = w.id AND t.language = 'ja' WHERE t.term = ANY(${entries.map(({ ja }) => ja)}) AND NOT (w.id = ANY(${ids})) ORDER BY w.id`;
    const categoryRows = await tx`SELECT id, name, name_zh FROM categories WHERE id = ${series}`;
    const categoryTranslations = await tx`SELECT category_id, language, name, description FROM category_translations WHERE category_id = ${series} ORDER BY language`;
    const spanCollisions = await tx`SELECT DISTINCT sentence_language, sentence FROM sentence_spans
      WHERE (sentence_language = 'en' AND sentence = ANY(${english})) OR (sentence_language = 'ja' AND sentence = ANY(${japanese}))
      ORDER BY sentence_language, sentence`;
    const published = await tx`SELECT id FROM words WHERE status = 'published' AND deleted_at IS NULL ORDER BY id`;
    const result = {
      checkedAt: new Date().toISOString(),
      databaseName: identity.database_name,
      databaseUser: identity.database_user,
      databaseHostFingerprint: hostFingerprint,
      publishedIdsDigest: digest(published.map(({ id }) => id)),
      publishedCount: published.length,
      tables,
      candidateRows,
      headwordConflicts,
      japaneseConflicts,
      categoryRows,
      categoryTranslations,
      spanCollisions,
      readyForGuardedApply: false,
    };
    result.readyForGuardedApply = Object.values(tables).every(Boolean) &&
      candidateRows.length === 0 && headwordConflicts.length === 0 && japaneseConflicts.length === 0 && categoryRows.length === 0 &&
      categoryTranslations.length === 0 && spanCollisions.length === 0;
    return result;
  });
}
