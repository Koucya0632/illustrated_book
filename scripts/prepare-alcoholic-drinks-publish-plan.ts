// Build an immutable, local-first publication plan for the alcoholic-drinks
// series. This command never writes to production Storage or the application
// database. With --check-db it adds a SELECT-only preflight and the exact
// current sake snapshot that a later compare-and-swap apply must preserve.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const ROOT = process.cwd();
const CHECK_DB = process.argv.includes("--check-db");
const BATCHES = ["a", "b"] as const;
const EXISTING_ID = "sake";
const NEW_COUNT = 33;
const OUTPUT_DIR = path.resolve(ROOT, "output/alcoholic-drinks-publish-prep");
const PLAN_FILE = path.join(OUTPUT_DIR, "publish-plan.json");
const SPANS_FILE = path.join(ROOT, "data/example-spans-alcoholic-drinks-2026-09.json");
const IMAGE_MANIFEST_FILE = path.join(OUTPUT_DIR, "image-manifest.json");
const VISUAL_REVIEW_FILE = path.join(OUTPUT_DIR, "visual-review.json");
const SEMANTIC_REVIEW_FILE = path.join(OUTPUT_DIR, "semantic-review.json");
const AUDIO_ROOT = path.join(ROOT, "output/alcoholic-drinks-audio-candidates");
const AUDIO_MANIFEST_FILE = path.join(AUDIO_ROOT, "generated-manifest.json");
const AUDIO_VERIFICATION_FILE = path.join(AUDIO_ROOT, "verification-report.json");

type Locale = "en-US" | "en-GB" | "ja-JP";
type Span = { t: string; z?: string; j?: string; e?: string; b?: string; p?: string; r?: string };
type Entry = {
  id: string;
  word: string;
  chinese: string;
  chineseDefinition: string;
  category: "alcoholic-drinks";
  partOfSpeech: "noun";
  pronunciation: string;
  definitions: Array<{ language: string; definition: string; sortOrder: number }>;
  examples: Array<{ en: string; ja: string; zh: string; cefrLevel: "A2" | "B1" }>;
  relatedWords: string[];
  ja: string;
  jaReading: string;
  jaReadingSegments: Array<{ text: string; ruby: string | null }> | null;
  imageUrl: string;
};

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return sha256(JSON.stringify(canonical(value)));
}

function relative(file: string): string {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function writeAtomic(file: string, value: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, value);
  fs.renameSync(temporary, file);
}

function expectedAudioText(entry: Entry, kind: "headword" | "example", slot: number | null, locale: Locale) {
  if (kind === "headword") return locale === "ja-JP" ? entry.ja : entry.word;
  const example = entry.examples[slot!];
  return locale === "ja-JP" ? example.ja : example.en;
}

function mapAudio(manifest: any, entry: Entry, kind: "headword" | "example", slot: number | null, locale: Locale) {
  const ownerKey = kind === "headword" ? entry.id : `${entry.id}:${slot}`;
  const key = `${kind}|${ownerKey}|${locale}`;
  const item = manifest.generated[key];
  if (!item) throw new Error(`${key}: generated audio is missing`);
  const expectedText = expectedAudioText(entry, kind, slot, locale);
  if (item.text !== expectedText || item.sourceText !== expectedText) {
    throw new Error(`${key}: generated text differs from reviewed content`);
  }
  const localFile = path.join(AUDIO_ROOT, item.file);
  const bytes = fs.readFileSync(localFile);
  const contentSha256 = sha256(bytes);
  if (item.bytes !== bytes.length || item.sha256 !== contentSha256) {
    throw new Error(`${key}: generated MP3 differs from its manifest`);
  }
  const suffix = `${locale}/${contentSha256.slice(0, 20)}.mp3`;
  return {
    kind,
    ownerKey,
    wordId: entry.id,
    ...(slot === null ? {} : { slot, sortOrder: slot }),
    locale,
    sourceText: expectedText,
    sourceLanguage: locale === "ja-JP" ? "ja" : "en",
    sourceDigest: sha256(`${locale}\u0000${expectedText}`),
    localFile: relative(localFile),
    bytes: bytes.length,
    contentSha256,
    mimeType: "audio/mpeg",
    model: "chirp-3-hd",
    voice: `${locale}-Chirp3-HD-${manifest.voice}`,
    bucket: "word-audio",
    storagePath:
      kind === "headword"
        ? `${entry.id}/${suffix}`
        : `examples/{exampleId}/${suffix}`,
    uploadRequired: true,
  };
}

async function databasePreflight(entries: Entry[]) {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("--check-db requires DATABASE_URL");
  const parsed = new URL(databaseUrl);
  const sql = postgres(databaseUrl, { ssl: "require", prepare: false, max: 1 });
  const newEntries = entries.filter(({ id }) => id !== EXISTING_ID);
  const ids = entries.map(({ id }) => id);
  const newIds = newEntries.map(({ id }) => id);
  const lowerWords = entries.map(({ word }) => word.toLowerCase());
  const english = entries.flatMap(({ examples }) => examples.map(({ en }) => en));
  const japanese = entries.flatMap(({ examples }) => examples.map(({ ja }) => ja));
  try {
    const [identity] = await sql<{ database_name: string; user_name: string }[]>`
      SELECT current_database() AS database_name, current_user AS user_name
    `;
    const [tables] = await sql<Record<string, string | null>[]>`
      SELECT
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
        to_regclass('public.cards')::text AS cards
    `;
    const candidateRows = await sql<Record<string, unknown>[]>`
      SELECT id, word, category, status FROM words WHERE id = ANY(${ids}) ORDER BY id
    `;
    const headwordConflicts = await sql<Record<string, unknown>[]>`
      SELECT id, word, status FROM words
      WHERE lower(word) = ANY(${lowerWords}) AND NOT (id = ANY(${ids}))
      ORDER BY id
    `;
    const category = await sql<Record<string, unknown>[]>`
      SELECT id, name, name_zh, emoji, description, description_en, color, image_url, sort_order
      FROM categories WHERE id = 'alcoholic-drinks'
    `;
    const spanCollisions = await sql<Record<string, unknown>[]>`
      SELECT DISTINCT sentence_language, sentence FROM sentence_spans
      WHERE (sentence_language = 'en' AND sentence = ANY(${english}))
         OR (sentence_language = 'ja' AND sentence = ANY(${japanese}))
      ORDER BY sentence_language, sentence
    `;
    const sakeWord = await sql<Record<string, unknown>[]>`
      SELECT id, word, also_known_as, category, part_of_speech, pronunciation,
             image_url, audio_url, cefr_level, status, collocations, note,
             chinese_definition, image_source_url, image_license, image_credit,
             etymology, forms, deleted_at
      FROM words WHERE id = ${EXISTING_ID}
    `;
    const sakeTerms = await sql<Record<string, unknown>[]>`
      SELECT word_id, language, term, reading, pronunciation, reading_segments, audio_url
      FROM word_terms WHERE word_id = ${EXISTING_ID} ORDER BY language
    `;
    const sakeDefinitions = await sql<Record<string, unknown>[]>`
      SELECT word_id, language, definition, cefr_level, sort_order
      FROM word_definitions WHERE word_id = ${EXISTING_ID} ORDER BY language, sort_order
    `;
    const sakeExamples = await sql<Record<string, unknown>[]>`
      SELECT id::text, word_id, sentence, cefr_level, sort_order
      FROM word_examples WHERE word_id = ${EXISTING_ID} ORDER BY sort_order, id
    `;
    const sakeExampleIds = sakeExamples.map(({ id }) => String(id));
    const sakeEnglishSentences = sakeExamples.map(({ sentence }) => String(sentence));
    const sakeTranslations = sakeExampleIds.length === 0 ? [] : await sql<Record<string, unknown>[]>`
      SELECT example_id::text, language, translation FROM word_example_translations
      WHERE example_id::text = ANY(${sakeExampleIds}) ORDER BY example_id, language
    `;
    const sakeJapaneseSentences = sakeTranslations
      .filter(({ language }) => language === "ja")
      .map(({ translation }) => String(translation));
    const sakeSpans = await sql<Record<string, unknown>[]>`
      SELECT sentence_language, sentence, sort_order, text, base_form,
             part_of_speech, reading, word_id, version
      FROM sentence_spans
      WHERE (sentence_language = 'en' AND sentence = ANY(${sakeEnglishSentences}))
         OR (sentence_language = 'ja' AND sentence = ANY(${sakeJapaneseSentences}))
      ORDER BY sentence_language, sentence, sort_order
    `;
    const sakeGlosses = await sql<Record<string, unknown>[]>`
      SELECT sentence_language, sentence, sort_order, language, gloss
      FROM sentence_span_glosses
      WHERE (sentence_language = 'en' AND sentence = ANY(${sakeEnglishSentences}))
         OR (sentence_language = 'ja' AND sentence = ANY(${sakeJapaneseSentences}))
      ORDER BY sentence_language, sentence, sort_order, language
    `;
    const sakeRelations = await sql<Record<string, unknown>[]>`
      SELECT source_word_id, target_word_id, relation_type, note
      FROM word_relations WHERE source_word_id = ${EXISTING_ID} ORDER BY target_word_id
    `;
    const sakeCategories = await sql<Record<string, unknown>[]>`
      SELECT word_id, category_id, is_primary
      FROM word_categories WHERE word_id = ${EXISTING_ID} ORDER BY category_id
    `;
    const sakeMedia = await sql<Record<string, unknown>[]>`
      SELECT word_id, kind, url, storage_path, mime_type, width, height,
             duration_ms, source_url, license, credit, prompt, model, locale,
             is_primary, sort_order, metadata
      FROM word_media WHERE word_id = ${EXISTING_ID} ORDER BY kind, locale, sort_order
    `;
    const sakeExampleMedia = sakeExampleIds.length === 0 ? [] : await sql<Record<string, unknown>[]>`
      SELECT example_id::text, locale, url, storage_path, mime_type, duration_ms, model
      FROM word_example_media WHERE example_id::text = ANY(${sakeExampleIds})
      ORDER BY example_id, locale
    `;
    const sakeCards = await sql<Record<string, unknown>[]>`
      SELECT id::text, word_id, card_type, front, back, explanation, tags, deck_key
      FROM cards WHERE word_id = ${EXISTING_ID} ORDER BY id
    `;
    const [sakeUserReferences] = await sql<Record<string, number>[]>`
      SELECT
        (SELECT count(*)::int FROM user_cards uc JOIN cards c ON c.id = uc.card_id WHERE c.word_id = ${EXISTING_ID}) AS user_cards,
        (SELECT count(*)::int FROM user_favorites WHERE word_id = ${EXISTING_ID}) AS user_favorites,
        (SELECT count(*)::int FROM user_learned WHERE word_id = ${EXISTING_ID}) AS user_learned,
        (SELECT count(*)::int FROM user_words WHERE word_id = ${EXISTING_ID}) AS user_words,
        (SELECT count(*)::int FROM study_logs WHERE word_id = ${EXISTING_ID}) AS study_logs,
        (SELECT count(*)::int FROM study_reports WHERE word_id = ${EXISTING_ID}) AS study_reports,
        (SELECT count(*)::int FROM user_atlas_items WHERE canonical_word_id = ${EXISTING_ID}) AS user_atlas_items
    `;
    const newConflicts = candidateRows.filter(({ id }) => newIds.includes(String(id)));
    const sakeCandidate = candidateRows.find(({ id }) => id === EXISTING_ID);
    const sakeBeforeCatalog = {
      words: sakeWord,
      terms: sakeTerms,
      definitions: sakeDefinitions,
      examples: sakeExamples,
      translations: sakeTranslations,
      spans: sakeSpans,
      glosses: sakeGlosses,
      relations: sakeRelations,
      categories: sakeCategories,
      media: sakeMedia,
      exampleMedia: sakeExampleMedia,
      cards: sakeCards,
    };
    const sakeBefore = {
      ...sakeBeforeCatalog,
      userReferences: sakeUserReferences,
    };
    return {
      checkedAt: new Date().toISOString(),
      databaseName: identity.database_name,
      databaseUser: identity.user_name,
      databaseHostFingerprint: sha256(
        `${parsed.protocol}//${parsed.username}@${parsed.hostname}:${parsed.port}/${parsed.pathname.replace(/^\//, "")}`,
      ).slice(0, 12),
      tables,
      category: category[0] ?? null,
      candidateRows,
      newIdConflicts: newConflicts,
      headwordConflicts,
      spanCollisions,
      sakeBefore,
      sakeBeforeDigest: digest(sakeBeforeCatalog),
      readyForGuardedApply:
        Object.values(tables).every(Boolean) &&
        category.length === 0 &&
        newConflicts.length === 0 &&
        headwordConflicts.length === 0 &&
        sakeCandidate?.status === "published" &&
        sakeCandidate?.category === "seasonings" &&
        sakeWord.length === 1 &&
        sakeExamples.length === 2 &&
        spanCollisions.length === 0,
    };
  } finally {
    await sql.end();
  }
}

async function main() {
  const batchFiles = BATCHES.map((batch) =>
    path.join(ROOT, `data/alcoholic-drinks-series-2026-09-batch-${batch}.json`),
  );
  const entries = batchFiles.flatMap((file) => readJson<{ entries: Entry[] }>(file).entries);
  const spans = readJson<{ en: Record<string, Span[]>; ja: Record<string, Span[]> }>(SPANS_FILE);
  const imageManifest = readJson<any>(IMAGE_MANIFEST_FILE);
  const visualReview = readJson<any>(VISUAL_REVIEW_FILE);
  const semanticReview = readJson<any>(SEMANTIC_REVIEW_FILE);
  const audioManifest = readJson<any>(AUDIO_MANIFEST_FILE);
  const audioVerification = readJson<any>(AUDIO_VERIFICATION_FILE);
  if (entries.length !== 34 || new Set(entries.map(({ id }) => id)).size !== 34) {
    throw new Error("expected exactly 34 unique alcoholic-drinks entries");
  }
  if (entries.filter(({ id }) => id !== EXISTING_ID).length !== NEW_COUNT) {
    throw new Error(`expected exactly ${NEW_COUNT} new entries plus sake`);
  }
  if (visualReview.summary.acceptedWordImages !== 34 || visualReview.summary.unreviewed !== 0) {
    throw new Error("visual review is incomplete");
  }
  if (semanticReview.summary.passed !== 102 || semanticReview.summary.failed !== 0) {
    throw new Error("semantic review is incomplete");
  }
  if (!audioVerification.passed || audioVerification.clipsVerified !== 306) {
    throw new Error("audio verification is not a clean 306/306 pass");
  }
  const imageById = new Map(imageManifest.images.map((image: any) => [image.id, image]));
  const allAudio: any[] = [];
  const mappedEntries = entries.map((entry) => {
    const image = imageById.get(entry.id) as any;
    if (!image) throw new Error(`${entry.id}: image manifest entry is missing`);
    const imageBytes = fs.readFileSync(path.resolve(ROOT, image.localFile));
    if (imageBytes.length !== image.bytes || sha256(imageBytes) !== image.contentSha256) {
      throw new Error(`${entry.id}: image bytes differ from the image manifest`);
    }
    const examples = entry.examples.map((example, sortOrder) => {
      const enSpans = spans.en[example.en];
      const jaSpans = spans.ja[example.ja];
      if (!enSpans || enSpans.map(({ t }) => t).join("") !== example.en) {
        throw new Error(`${entry.id}:${sortOrder}: English spans are missing or stale`);
      }
      if (!jaSpans || jaSpans.map(({ t }) => t).join("") !== example.ja) {
        throw new Error(`${entry.id}:${sortOrder}: Japanese spans are missing or stale`);
      }
      const audio = (["en-US", "en-GB", "ja-JP"] as const).map((locale) =>
        mapAudio(audioManifest, entry, "example", sortOrder, locale),
      );
      allAudio.push(...audio);
      return {
        ownerKey: `${entry.id}:${sortOrder}`,
        sortOrder,
        ...example,
        spans: { en: enSpans, ja: jaSpans },
        audio,
      };
    });
    const headwordAudio = (["en-US", "en-GB", "ja-JP"] as const).map((locale) =>
      mapAudio(audioManifest, entry, "headword", null, locale),
    );
    allAudio.push(...headwordAudio);
    return {
      operation: entry.id === EXISTING_ID ? "update-existing" : "insert",
      contentDigest: sha256(JSON.stringify(entry)),
      word: entry,
      image: { ...image, uploadRequired: image.mode !== "reuse-existing" },
      headwordAudio,
      examples,
    };
  });
  if (allAudio.length !== 306) throw new Error(`expected 306 audio clips, found ${allAudio.length}`);
  const categoryImageBytes = fs.readFileSync(path.resolve(ROOT, imageManifest.category.localFile));
  if (
    categoryImageBytes.length !== imageManifest.category.bytes ||
    sha256(categoryImageBytes) !== imageManifest.category.contentSha256
  ) {
    throw new Error("category image bytes differ from the image manifest");
  }

  const databasePreflightResult = CHECK_DB ? await databasePreflight(entries) : null;
  const sourceFiles = [
    ...batchFiles,
    SPANS_FILE,
    IMAGE_MANIFEST_FILE,
    VISUAL_REVIEW_FILE,
    SEMANTIC_REVIEW_FILE,
    AUDIO_MANIFEST_FILE,
    AUDIO_VERIFICATION_FILE,
  ].map((file) => ({ file: relative(file), sha256: sha256(fs.readFileSync(file)) }));
  const plan = {
    schemaVersion: 1,
    series: "alcoholic-drinks",
    status:
      databasePreflightResult && !databasePreflightResult.readyForGuardedApply
        ? "prepared-with-preflight-conflicts"
        : "prepared",
    productionWriteAllowed: false,
    createdAt: new Date().toISOString(),
    releaseShape: { insertWordIds: entries.filter(({ id }) => id !== EXISTING_ID).map(({ id }) => id), updateWordIds: [EXISTING_ID] },
    category: {
      id: "alcoholic-drinks",
      name: "Alcoholic Drinks",
      nameZh: "酒類",
      nameJa: "酒類",
      emoji: "🍶",
      description: "日本酒から世界各地の身近なお酒まで",
      descriptionEn: "Familiar alcoholic drinks from Japan and around the world",
      descriptionJa: "日本酒から世界各地の身近なお酒まで",
      color: "from-amber-100 to-rose-100",
      imageUrl: imageManifest.category.url,
      image: { ...imageManifest.category, uploadRequired: true },
      reviewRequired: false,
    },
    sourceFiles,
    databasePreflight: databasePreflightResult,
    summary: {
      words: 34,
      insertedWords: 33,
      updatedWords: 1,
      definitions: mappedEntries.reduce((sum, item) => sum + item.word.definitions.length, 0),
      examples: 68,
      spanSentences: 136,
      wordImages: 34,
      newWordImages: 33,
      reusedWordImages: 1,
      categoryImages: 1,
      audioClips: 306,
      storageArtifacts: 341,
      storageUploads: 340,
    },
    applyOrder: [
      "repeat the SELECT-only database preflight and compare the full sake snapshot digest",
      "stage 340 content-addressed image/audio objects and verify their remote bytes",
      "insert 33 draft words and update sake in one serializable transaction without changing its word ID or card IDs",
      "replace only reviewed catalogue-owned sake children using compare-and-swap checks",
      "publish the 33 drafts and expose the category only when all 34 word IDs are published",
      "verify database rows, all media locales, public object hashes, /api/words and category visibility",
    ],
    rollbackContract: {
      database: "Restore sake from databasePreflight.sakeBefore and delete only the 33 inserted IDs, all under compare-and-swap guards against the applied snapshot.",
      cards: "Preserve existing sake card IDs so user_cards references remain valid; restore only their reviewed mutable fields.",
      storage: "Retain content-addressed objects by default; delete only through a separately audited cleanup after proving no database references remain.",
      stopConditions: [
        "the sake snapshot digest differs",
        "any of the 33 new IDs already exists",
        "the category already exists with unreviewed content",
        "a sentence-span collision exists",
        "the logical database or physical Storage fingerprint differs from the confirmed dry run",
      ],
    },
    entries: mappedEntries,
  };
  writeAtomic(PLAN_FILE, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify({
    output: relative(PLAN_FILE),
    status: plan.status,
    productionWriteAllowed: false,
    ...plan.summary,
    databasePreflight: databasePreflightResult
      ? {
          readyForGuardedApply: databasePreflightResult.readyForGuardedApply,
          newIdConflicts: databasePreflightResult.newIdConflicts.length,
          headwordConflicts: databasePreflightResult.headwordConflicts.length,
          spanCollisions: databasePreflightResult.spanCollisions.length,
          categoryExists: Boolean(databasePreflightResult.category),
          sakeBeforeDigest: databasePreflightResult.sakeBeforeDigest,
        }
      : "not requested",
  }, null, 2));
}

main().catch((error) => {
  console.error("[prepare-alcoholic-drinks-publish-plan] failed:", error);
  process.exitCode = 1;
});
