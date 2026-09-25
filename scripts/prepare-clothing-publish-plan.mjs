// Read-only preparation. This script does not upload media or modify the database.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT = path.join(ROOT, "output/clothing-publish-prep");
const AUDIO = path.join(ROOT, "output/clothing-audio-candidates");
const CHECK_DB = process.argv.includes("--check-db");
const SOURCE = {
  candidates: "data/clothing-series-2026-09.json",
  canonicalImages: "lib/image-urls.json",
  spans: "data/example-spans-clothing-2026-09.json",
  images: "output/clothing-publish-prep/image-manifest.json",
  visualReview: "output/clothing-publish-prep/visual-review.json",
  semanticReview: "output/clothing-publish-prep/semantic-review.json",
  audioPlan: "output/clothing-audio-plan/manifest.json",
  audio: "output/clothing-audio-candidates/generated-manifest.json",
  audioVerification: "output/clothing-audio-candidates/verification-report.json",
};
const locales = ["en-US", "en-GB", "ja-JP"];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative));
const json = (relative) => JSON.parse(read(relative).toString("utf8"));
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value;
const digest = (value) => sha256(JSON.stringify(canonical(value)));
const invariant = (ok, message) => { if (!ok) throw new Error(message); };

function verifiedFile(meta) {
  invariant(typeof meta.localFile === "string" && !path.isAbsolute(meta.localFile), "invalid local media path");
  const full = path.resolve(ROOT, meta.localFile);
  invariant(full.startsWith(`${ROOT}${path.sep}`), `${meta.localFile}: escapes repository`);
  const bytes = fs.readFileSync(full);
  invariant(bytes.length === meta.bytes && sha256(bytes) === meta.contentSha256, `${meta.localFile}: bytes changed`);
  return meta;
}

async function databasePreflight(entries) {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  invariant(databaseUrl, "--check-db requires DATABASE_URL");
  const url = new URL(databaseUrl);
  const sql = postgres(databaseUrl, { ssl: "require", prepare: false, max: 1 });
  const ids = entries.map(({ id }) => id);
  const words = entries.map(({ word }) => word.toLowerCase());
  const english = entries.flatMap(({ examples }) => examples.map(({ en }) => en));
  const japanese = entries.flatMap(({ examples }) => examples.map(({ ja }) => ja));
  try {
    const [identity] = await sql`SELECT current_database() AS database_name, current_user AS database_user`;
    const [tables] = await sql`SELECT
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
    const candidateRows = await sql`SELECT id, word, category, status FROM words WHERE id = ANY(${ids}) ORDER BY id`;
    const headwordConflicts = await sql`SELECT id, word, category, status FROM words WHERE lower(word) = ANY(${words}) AND NOT (id = ANY(${ids})) ORDER BY id`;
    const categoryRows = await sql`SELECT id, name, name_zh FROM categories WHERE id = 'clothing'`;
    const categoryTranslations = await sql`SELECT category_id, language, name, description FROM category_translations WHERE category_id = 'clothing' ORDER BY language`;
    const spanCollisions = await sql`SELECT DISTINCT sentence_language, sentence FROM sentence_spans
      WHERE (sentence_language = 'en' AND sentence = ANY(${english})) OR (sentence_language = 'ja' AND sentence = ANY(${japanese}))
      ORDER BY sentence_language, sentence`;
    const published = await sql`SELECT id FROM words WHERE status = 'published' AND deleted_at IS NULL ORDER BY id`;
    const result = {
      checkedAt: new Date().toISOString(),
      databaseName: identity.database_name,
      databaseUser: identity.database_user,
      databaseHostFingerprint: sha256(`${url.protocol}//${url.username}@${url.hostname}:${url.port}/${url.pathname.replace(/^\//, "")}`).slice(0, 12),
      publishedIdsDigest: digest(published.map(({ id }) => id)),
      publishedCount: published.length,
      tables,
      candidateRows,
      headwordConflicts,
      categoryRows,
      categoryTranslations,
      spanCollisions,
    };
    result.readyForGuardedApply = Object.values(tables).every(Boolean) &&
      candidateRows.length === 0 && headwordConflicts.length === 0 && categoryRows.length === 0 &&
      categoryTranslations.length === 0 && spanCollisions.length === 0;
    return result;
  } finally {
    await sql.end();
  }
}

async function main() {
  const sources = Object.fromEntries(Object.entries(SOURCE).map(([key, relative]) => [key, { file: relative, sha256: sha256(read(relative)) }]));
  const entries = json(SOURCE.candidates).entries;
  const canonicalImages = json(SOURCE.canonicalImages);
  const spans = json(SOURCE.spans);
  const images = json(SOURCE.images);
  const visual = json(SOURCE.visualReview);
  const semantic = json(SOURCE.semanticReview);
  const audioPlan = json(SOURCE.audioPlan);
  const audioManifest = json(SOURCE.audio);
  const audioVerification = json(SOURCE.audioVerification);
  invariant(entries.length === 50 && new Set(entries.map(({ id }) => id)).size === entries.length, "expected 50 unique candidate IDs");
  invariant(entries.every((entry) => canonicalImages[entry.id] === entry.imageUrl), "canonical image URLs differ from candidate URLs");
  invariant(entries.every(({ category, examples }) => category === "clothing" && examples.length === 2 && examples[0].cefrLevel === "A2" && examples[1].cefrLevel === "B1"), "category or example contract mismatch");
  invariant(visual.summary.passedWordImages === entries.length && visual.summary.failedWordImages === 0 && visual.summary.passedCategoryImages === 1, "visual review incomplete");
  invariant(semantic.summary.passed === entries.length * 3 && semantic.summary.failed === 0, "semantic review incomplete");
  invariant(audioVerification.passed && audioVerification.clipsVerified === audioPlan.jobs.length, "audio verification incomplete");
  invariant(images.images.length === entries.length, "word-image count mismatch");
  const imageById = new Map(images.images.map((image) => [image.id, image]));
  invariant(imageById.size === entries.length, "image IDs are not unique");
  const reviewImages = [...images.images, images.categoryImage];
  invariant(visual.reviews.length === reviewImages.length, "visual review item count mismatch");
  const visualById = new Map(visual.reviews.map((review) => [review.id, review]));
  invariant(visualById.size === reviewImages.length, "visual review IDs are not unique");
  for (const image of reviewImages) {
    const review = visualById.get(image.id);
    invariant(review?.decision === "pass" && review.localFile === image.localFile && review.contentSha256 === image.contentSha256 && review.reason?.trim(), `${image.id}: visual review does not match selected image`);
  }
  invariant(semantic.items.length === entries.length * 3, "semantic review item count mismatch");
  const semanticById = new Map(semantic.items.map((review) => [review.id, review]));
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
  const storagePaths = new Set();
  const addPath = (bucket, storagePath) => {
    const key = `${bucket}/${storagePath}`;
    invariant(!storagePaths.has(key), `duplicate storage object: ${key}`);
    storagePaths.add(key);
  };
  const categoryImage = verifiedFile(images.categoryImage);
  addPath(categoryImage.bucket, categoryImage.storagePath);
  const usedAudio = new Set();
  const mapAudio = (entry, kind, slot, locale) => {
    const ownerKey = kind === "headword" ? entry.id : `${entry.id}:${slot}`;
    const key = `${kind}|${ownerKey}|${locale}`;
    const clip = audioManifest.generated[key];
    const expectedText = kind === "headword" ? (locale === "ja-JP" ? entry.ja : entry.word)
      : (locale === "ja-JP" ? entry.examples[slot].ja : entry.examples[slot].en);
    invariant(clip && clip.text === expectedText && clip.sourceText === expectedText, `${key}: missing or stale audio text`);
    invariant(!usedAudio.has(key), `${key}: duplicate owner-locale`);
    usedAudio.add(key);
    const full = path.resolve(AUDIO, clip.file);
    invariant(full.startsWith(`${AUDIO}${path.sep}`), `${key}: invalid audio path`);
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
      localFile: path.relative(ROOT, full).split(path.sep).join("/"), bytes: clip.bytes,
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
    const examples = entry.examples.map((example, slot) => {
      const en = spans.en[example.en], ja = spans.ja[example.ja];
      invariant(en && en.map(({ t }) => t).join("") === example.en, `${entry.id}:${slot}: English spans changed`);
      invariant(ja && ja.map(({ t }) => t).join("") === example.ja, `${entry.id}:${slot}: Japanese spans changed`);
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
  const db = CHECK_DB ? await databasePreflight(entries) : null;
  const storageTarget = {
    backend: process.env.R2_ACCOUNT_ID ? "r2" : "unconfigured",
    bucket: process.env.R2_BUCKET ?? null,
    endpoint: process.env.R2_ENDPOINT ?? null,
    publicBase: process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? null,
    fingerprint: sha256(JSON.stringify({ backend: process.env.R2_ACCOUNT_ID ? "r2" : "unconfigured", accountId: process.env.R2_ACCOUNT_ID ?? "", bucket: process.env.R2_BUCKET ?? "", endpoint: process.env.R2_ENDPOINT ?? "", publicBase: process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? "" })).slice(0, 12),
  };
  const content = {
    schemaVersion: 1, series: "clothing", productionWriteAllowed: false,
    releaseShape: { insertWordIds: entries.map(({ id }) => id), updateWordIds: [] },
    category: {
      id: "clothing", name: "Clothing & Style", nameZh: "服飾穿搭", nameJa: "服とファッション", emoji: "👕",
      description: "從日常服裝到鞋履配件的實用單品",
      descriptionEn: "Medicines, health essentials, and beauty products in Japanese clothings",
      descriptionJa: "普段着から靴・小物まで、毎日の装いに役立つアイテム",
      color: "from-sky-100 to-amber-100", imageUrl: categoryImage.url,
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
  const plan = {
    ...content, planDigest: digest(content), createdAt: new Date().toISOString(),
    status: db && !db.readyForGuardedApply ? "prepared-with-preflight-conflicts" : "prepared",
    databasePreflight: db, storageTarget,
  };
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT, "publish-plan.json.tmp"), `${JSON.stringify(plan, null, 2)}\n`);
  fs.renameSync(path.join(OUTPUT, "publish-plan.json.tmp"), path.join(OUTPUT, "publish-plan.json"));
  console.log(JSON.stringify({ file: "output/clothing-publish-prep/publish-plan.json", planDigest: plan.planDigest, status: plan.status, summary: plan.summary, databasePreflight: db && {
    readyForGuardedApply: db.readyForGuardedApply, publishedCount: db.publishedCount,
    candidateRows: db.candidateRows.length, headwordConflicts: db.headwordConflicts.length,
    categoryRows: db.categoryRows.length, spanCollisions: db.spanCollisions.length,
  }, storageTarget: { backend: storageTarget.backend, bucket: storageTarget.bucket, fingerprint: storageTarget.fingerprint } }, null, 2));
}

main().catch((error) => { console.error("[prepare-clothing-publish-plan]", error); process.exitCode = 1; });
