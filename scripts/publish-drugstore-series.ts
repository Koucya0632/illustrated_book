// Guarded one-time publisher for the reviewed 2026-09 drugstore series.
//
// Default mode is a SELECT-only dry run:
//   npm run drugstore:publish
//
// Production writes require BOTH --apply and the database-host fingerprint
// plus the physical Storage target fingerprint printed by the dry run:
//   npm run drugstore:publish -- --apply \
//     --confirm-host <database-fingerprint> \
//     --confirm-storage <storage-fingerprint>
//
// Rollback is likewise explicit and compare-and-swap guarded:
//   npm run drugstore:publish -- --rollback <apply-manifest.json> \
//     --confirm-host <database-fingerprint> \
//     --confirm-storage <storage-fingerprint>

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { SPANS_VERSION } from "../lib/example-spans";
import { WORD_IMAGE_CONTENT_TYPE } from "../lib/word-image-encode";
import {
  assertWriterConfigured,
  listPublicObjects,
  putPublicObject,
  writeBackend,
} from "../lib/storage/public-writer";
import { publicObjectUrl } from "../lib/storage/public-objects";

const ROOT = process.cwd();
const DEFAULT_PLAN_FILE = path.resolve(
  ROOT,
  "output/drugstore-publish-prep/publish-plan.json",
);
const PLAN_ARGUMENT = argument("--plan");
const APPLY = process.argv.includes("--apply");
const ROLLBACK_FILE = argument("--rollback");
const RESUME_FILE = argument("--resume");
const CONFIRMED_HOST = argument("--confirm-host");
const CONFIRMED_STORAGE = argument("--confirm-storage");

type Sql = ReturnType<typeof postgres>;
type Tx = postgres.TransactionSql;
type Json = Record<string, unknown>;

interface StorageObjectPlan {
  key: string;
  bucket: "word-images" | "word-audio";
  storagePath: string;
  url: string;
  localFile: string;
  bytes: number;
  contentSha256: string;
  mimeType: string;
  existedBefore: boolean;
  uploadedByRun: boolean;
  uploadIntent: boolean;
  verified: boolean;
}

interface ApplyManifest {
  schemaVersion: 1;
  series: "drugstore";
  status:
    | "prepared"
    | "ids-reserved"
    | "draft-inserted"
    | "uploading"
    | "uploaded"
    | "applied"
    | "rolling-back"
    | "rollback-failed"
    | "rolled-back"
    | "rolled-back-storage-retained"
    | "failed";
  createdAt: string;
  updatedAt: string;
  databaseHostFingerprint: string;
  storageBackend: "r2" | "supabase";
  storageTargetFingerprint: string;
  planFile: string;
  planSha256: string;
  categoryExistedBefore: boolean;
  categoryBefore: Json | null;
  resolvedExampleIds: Record<string, string>;
  storageObjects: StorageObjectPlan[];
  failure?: string;
  appliedAt?: string;
  rolledBackAt?: string;
}

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function relative(file: string): string {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function writeJsonAtomic(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function databaseConfig() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("missing DATABASE_URL");
  const parsed = new URL(databaseUrl);
  return {
    databaseUrl,
    // Identify the logical database without persisting credentials. Hostname
    // alone is insufficient when multiple DBs/users share one server.
    hostFingerprint: sha256(
      `${parsed.protocol}//${parsed.username}@${parsed.hostname}:${parsed.port}/${parsed.pathname.replace(/^\//, "")}`,
    ).slice(0, 12),
  };
}

function currentStorageTargetFingerprint(): string {
  const backend = writeBackend();
  const identity = backend === "r2"
    ? {
        backend,
        accountId: process.env.R2_ACCOUNT_ID ?? "",
        bucket: process.env.R2_BUCKET ?? "",
        endpoint: process.env.R2_ENDPOINT ?? "",
        publicBase: process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? "",
      }
    : {
        backend,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      };
  return sha256(JSON.stringify(identity)).slice(0, 12);
}

function assertWriteConfirmation(
  hostFingerprint: string,
  storageTargetFingerprint: string,
) {
  if (CONFIRMED_HOST !== hostFingerprint) {
    throw new Error(
      `write refused: pass --confirm-host ${hostFingerprint} from a fresh dry run`,
    );
  }
  if (CONFIRMED_STORAGE !== storageTargetFingerprint) {
    throw new Error(
      `write refused: pass --confirm-storage ${storageTargetFingerprint} from a fresh dry run`,
    );
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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

function assertRowSet(label: string, actual: unknown[], expected: unknown[]) {
  const normalizedActual = actual.map((row) => JSON.stringify(canonical(row))).sort();
  const normalizedExpected = expected.map((row) => JSON.stringify(canonical(row))).sort();
  if (!sameValue(normalizedActual, normalizedExpected)) {
    throw new Error(
      `publish refused: ${label} differ from the reviewed plan ` +
        `(actual ${actual.length}, expected ${expected.length})`,
    );
  }
}

function expectedCategory(plan: any) {
  return {
    id: plan.category.id,
    name: plan.category.name,
    name_zh: plan.category.nameZh,
    emoji: plan.category.emoji,
    description: plan.category.description,
    description_en: plan.category.descriptionEn,
    color: plan.category.color,
    image_url: plan.category.imageUrl,
  };
}

async function inspectDatabase(sql: Sql, plan: any) {
  const ids = plan.entries.map((item: any) => item.word.id);
  const lowerWords = plan.entries.map((item: any) => item.word.word.toLowerCase());
  const englishSentences = plan.entries.flatMap((item: any) =>
    item.examples.map((example: any) => example.en),
  );
  const japaneseSentences = plan.entries.flatMap((item: any) =>
    item.examples.map((example: any) => example.ja),
  );
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
      to_regclass('public.word_tags')::text AS word_tags,
      to_regclass('public.word_localized_texts')::text AS word_localized_texts,
      to_regclass('public.cards')::text AS cards,
      to_regclass('public.word_media')::text AS word_media,
      to_regclass('public.word_example_media')::text AS word_example_media,
      to_regclass('public.user_cards')::text AS user_cards,
      to_regclass('public.user_favorites')::text AS user_favorites,
      to_regclass('public.user_learned')::text AS user_learned,
      to_regclass('public.user_words')::text AS user_words,
      to_regclass('public.study_logs')::text AS study_logs,
      to_regclass('public.study_reports')::text AS study_reports,
      to_regclass('public.user_atlas_items')::text AS user_atlas_items
  `;
  const missingTables = Object.entries(tables)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  const words = await sql<Json[]>`
    SELECT id, word, category, part_of_speech, pronunciation, image_url, status,
           chinese_definition, deleted_at
    FROM words WHERE id = ANY(${ids}) ORDER BY id
  `;
  const headwordConflicts = await sql<Json[]>`
    SELECT id, word, status
    FROM words
    WHERE lower(word) = ANY(${lowerWords}) AND NOT (id = ANY(${ids}))
    ORDER BY id
  `;
  const category = await sql<Json[]>`
    SELECT id, name, name_zh, emoji, description, description_en, color, image_url
    FROM categories WHERE id = ${plan.category.id}
  `;
  const categoryTranslations = await sql<Json[]>`
    SELECT category_id, language, name, description
    FROM category_translations
    WHERE category_id = ${plan.category.id} AND language = 'ja'
  `;
  const spanCollisions = await sql<{ sentence_language: string; sentence: string }[]>`
    SELECT DISTINCT sentence_language, sentence
    FROM sentence_spans
    WHERE (sentence_language = 'en' AND sentence = ANY(${englishSentences}))
       OR (sentence_language = 'ja' AND sentence = ANY(${japaneseSentences}))
    ORDER BY sentence_language, sentence
  `;
  const states = new Map(words.map((row) => [String(row.id), String(row.status)]));
  const newSeries = words.length === 0;
  const resumableDraft =
    words.length === ids.length && ids.every((id: string) => states.get(id) === "draft");
  const alreadyPublished =
    words.length === ids.length && ids.every((id: string) => states.get(id) === "published");
  const categoryMatches = category.length === 0 || sameValue(category[0], expectedCategory(plan));
  const expectedCategoryTranslation = {
    category_id: plan.category.id,
    language: "ja",
    name: plan.category.nameJa,
    description: plan.category.descriptionJa,
  };
  const categoryTranslationMatches =
    categoryTranslations.length === 0 ||
    (categoryTranslations.length === 1 &&
      sameValue(categoryTranslations[0], expectedCategoryTranslation));
  return {
    tables,
    missingTables,
    words,
    headwordConflicts,
    category: category[0] ?? null,
    categoryMatches,
    categoryTranslationMatches,
    spanCollisions,
    newSeries,
    resumableDraft,
    alreadyPublished,
    writeReady:
      missingTables.length === 0 &&
      headwordConflicts.length === 0 &&
      categoryMatches &&
      categoryTranslationMatches &&
      (newSeries || resumableDraft || alreadyPublished) &&
      (spanCollisions.length === 0 || resumableDraft || alreadyPublished),
  };
}

function verifyPreparedPlan(plan: any, planBytes: Buffer) {
  const { planDigest, createdAt, status, databasePreflight, storageTarget, ...content } = plan;
  if (planDigest !== sha256(JSON.stringify(canonical(content)))) {
    throw new Error("publish plan content digest changed");
  }
  if (
    plan.schemaVersion !== 1 ||
    plan.series !== "drugstore" ||
    plan.productionWriteAllowed !== false ||
    !plan.sources || !plan.category?.image ||
    plan.summary?.words !== plan.entries?.length ||
    plan.summary?.examples !== plan.entries?.length * 2 ||
    plan.summary?.wordImages !== plan.entries?.length ||
    plan.summary?.categoryImages !== 1 ||
    plan.summary?.audioClips !== plan.entries?.length * 9 ||
    plan.summary?.storageObjects !== plan.summary.wordImages + plan.summary.categoryImages + plan.summary.audioClips ||
    !Array.isArray(plan.entries) ||
    plan.entries.length === 0
  ) {
    throw new Error("invalid or incomplete drugstore publish plan");
  }
  for (const source of Object.values(plan.sources) as { file: string; sha256: string }[]) {
    if (sha256(fs.readFileSync(path.resolve(ROOT, source.file))) !== source.sha256) {
      throw new Error(`${source.file}: reviewed source changed after planning`);
    }
  }
  const ids = new Set<string>();
  const artifacts = new Set<string>();
  if (plan.category.image.url !== publicObjectUrl("word-images", plan.category.image.storagePath) ||
      plan.category.imageUrl !== plan.category.image.url) {
    throw new Error("category image URL differs from the physical Storage target");
  }
  const categoryBytes = fs.readFileSync(path.resolve(ROOT, plan.category.image.localFile));
  if (categoryBytes.length !== plan.category.image.bytes || sha256(categoryBytes) !== plan.category.image.contentSha256) {
    throw new Error("category image bytes no longer match the plan");
  }
  artifacts.add(`${plan.category.image.bucket}|${plan.category.image.storagePath}|category|image`);
  for (const item of plan.entries) {
    const id = item.word?.id;
    if (!id || ids.has(id)) throw new Error(`duplicate or empty word ID: ${id}`);
    ids.add(id);
    const media = [
      item.image,
      ...item.headwordAudio,
      ...item.examples.flatMap((example: any) => example.audio),
    ];
    for (const artifact of media) {
      const file = path.resolve(ROOT, artifact.localFile);
      const bytes = fs.readFileSync(file);
      if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.contentSha256) {
        throw new Error(`${artifact.localFile}: local bytes no longer match the plan`);
      }
      const key = `${artifact.bucket}|${artifact.storagePath}|${artifact.ownerKey ?? id}|${artifact.locale ?? "image"}`;
      if (artifacts.has(key)) throw new Error(`duplicate planned artifact: ${key}`);
      artifacts.add(key);
    }
  }
  if (artifacts.size !== plan.summary.storageObjects) {
    throw new Error(`expected ${plan.summary.storageObjects} artifacts, found ${artifacts.size}`);
  }
  return { planSha256: sha256(planBytes), ids };
}

async function insertDraftContent(
  tx: Tx,
  plan: any,
  exampleIds: Record<string, string>,
): Promise<void> {
  const category = expectedCategory(plan);
  await tx`
    INSERT INTO categories
      (id, name, name_zh, emoji, description, description_en, color, image_url, sort_order)
    VALUES
      (${category.id}, ${category.name}, ${category.name_zh}, ${category.emoji},
       ${category.description}, ${category.description_en}, ${category.color},
       ${category.image_url},
       (SELECT COALESCE(max(sort_order), -1) + 1 FROM categories))
    ON CONFLICT (id) DO NOTHING
  `;
  await tx`
    INSERT INTO category_translations (category_id, language, name, description)
    VALUES (${category.id}, 'ja', ${plan.category.nameJa}, ${plan.category.descriptionJa})
    ON CONFLICT (category_id, language) DO NOTHING
  `;

  for (const item of plan.entries) {
    const word = item.word;
    const imageUrl = publicObjectUrl("word-images", item.image.storagePath);
    await tx`
      INSERT INTO words (
        id, word, also_known_as, category, part_of_speech, pronunciation,
        image_url, status, collocations, note, chinese_definition,
        image_source_url, image_license, image_credit
      ) VALUES (
        ${word.id}, ${word.word}, ${[]}, ${word.category}, ${word.partOfSpeech},
        ${word.pronunciation}, ${imageUrl}, 'draft', ${[]}, ${null},
        ${word.chineseDefinition}, ${null}, ${item.image.license}, ${item.image.credit}
      )
    `;
    for (const definition of word.definitions) {
      await tx`
        INSERT INTO word_definitions (word_id, language, definition, sort_order)
        VALUES (${word.id}, ${definition.language}, ${definition.definition}, ${definition.sortOrder})
      `;
    }
    await tx`
      INSERT INTO word_terms (word_id, language, term, pronunciation)
      VALUES (${word.id}, 'en', ${word.word}, ${word.pronunciation})
    `;
    await tx`
      INSERT INTO word_terms (
        word_id, language, term, reading, pronunciation, reading_segments
      ) VALUES (
        ${word.id}, 'ja', ${word.ja}, ${word.jaReading}, ${word.jaReading},
        ${word.jaReadingSegments ? tx.json(word.jaReadingSegments) : null}
      )
    `;
    for (const example of item.examples) {
      const exampleId = exampleIds[example.ownerKey];
      if (!exampleId) throw new Error(`${example.ownerKey}: missing reserved example ID`);
      await tx`
        INSERT INTO word_examples (id, word_id, sentence, cefr_level, sort_order)
        VALUES (${exampleId}, ${word.id}, ${example.en}, ${example.cefrLevel}, ${example.sortOrder})
      `;
      await tx`
        INSERT INTO word_example_translations (example_id, language, translation)
        VALUES
          (${exampleId}, 'ja', ${example.ja}),
          (${exampleId}, 'zh', ${example.zh})
      `;
    }
    await tx`
      INSERT INTO word_categories (word_id, category_id, is_primary)
      VALUES (${word.id}, ${word.category}, TRUE)
    `;
  }

  // All candidate related words belong to this new series. Insert their links
  // only after every target word row exists, so the relation FK is satisfied.
  for (const item of plan.entries) {
    for (const relatedId of item.word.relatedWords) {
      if (relatedId === item.word.id) throw new Error(`${item.word.id}: self relation refused`);
      await tx`
        INSERT INTO word_relations (source_word_id, target_word_id, relation_type, note)
        VALUES (${item.word.id}, ${relatedId}, 'see-also', NULL)
      `;
    }
  }

  const catalogue = new Map<string, string>();
  for (const row of await tx<{ word_id: string; term: string }[]>`
    SELECT word_id, lower(term) AS term FROM word_terms ORDER BY word_id
  `) {
    if (!catalogue.has(row.term)) catalogue.set(row.term, row.word_id);
  }
  for (const item of plan.entries) {
    for (const example of item.examples) {
      for (const [language, sentence, spans] of [
        ["en", example.en, example.spans.en],
        ["ja", example.ja, example.spans.ja],
      ] as const) {
        for (const [sortOrder, span] of spans.entries()) {
          const base = String(span.b ?? span.t).toLowerCase().trim();
          const linkedWordId = span.z ? (catalogue.get(base) ?? null) : null;
          await tx`
            INSERT INTO sentence_spans (
              sentence_language, sentence, sort_order, text, base_form,
              part_of_speech, reading, word_id, version
            ) VALUES (
              ${language}, ${sentence}, ${sortOrder}, ${span.t}, ${span.b ?? null},
              ${span.p ?? null}, ${span.r ?? null}, ${linkedWordId}, ${SPANS_VERSION}
            )
          `;
          for (const [glossLanguage, gloss] of [
            ["zh-Hant", span.z],
            ["ja", span.j],
            ["en", span.e],
          ] as const) {
            if (!gloss) continue;
            await tx`
              INSERT INTO sentence_span_glosses (
                sentence_language, sentence, sort_order, language, gloss
              ) VALUES (${language}, ${sentence}, ${sortOrder}, ${glossLanguage}, ${gloss})
            `;
          }
        }
      }
    }
  }
}

async function reserveExampleIds(
  sql: Sql,
  plan: any,
): Promise<Record<string, string>> {
  const owners = plan.entries.flatMap((item: any) =>
    item.examples.map((example: any) => example.ownerKey),
  );
  const rows = await sql<{ id: string }[]>`
    SELECT nextval(pg_get_serial_sequence('word_examples', 'id'))::text AS id
    FROM generate_series(1, ${owners.length})
  `;
  if (rows.length !== owners.length) {
    throw new Error(`failed to reserve ${owners.length} example IDs`);
  }
  return Object.fromEntries(owners.map((owner: string, index: number) => [owner, rows[index].id]));
}

async function resolveDraftExampleIds(sql: Sql | Tx, plan: any) {
  const ids = plan.entries.map((item: any) => item.word.id);
  const rows = await sql<{
    id: string;
    word_id: string;
    sentence: string;
    sort_order: number;
    ja: string | null;
  }[]>`
    SELECT e.id, e.word_id, e.sentence, e.sort_order,
           max(t.translation) FILTER (WHERE t.language = 'ja') AS ja
    FROM word_examples e
    LEFT JOIN word_example_translations t ON t.example_id = e.id
    WHERE e.word_id = ANY(${ids})
    GROUP BY e.id, e.word_id, e.sentence, e.sort_order
    ORDER BY e.word_id, e.sort_order, e.id
  `;
  if (rows.length !== plan.summary.examples) throw new Error(`expected ${plan.summary.examples} stored examples, found ${rows.length}`);
  const byOwner = new Map(rows.map((row) => [`${row.word_id}:${row.sort_order}`, row]));
  const result: Record<string, string> = {};
  for (const item of plan.entries) {
    for (const example of item.examples) {
      const row = byOwner.get(example.ownerKey);
      if (!row || row.sentence !== example.en || row.ja !== example.ja) {
        throw new Error(`${example.ownerKey}: stored example identity does not match the plan`);
      }
      result[example.ownerKey] = String(row.id);
    }
  }
  return result;
}

async function assertStoredContentMatchesPlan(
  tx: Tx,
  plan: any,
  exampleIds: Record<string, string>,
  manifest: ApplyManifest,
  phase: "draft" | "published",
) {
  const ids = plan.entries.map((item: any) => item.word.id);
  const english = plan.entries.flatMap((item: any) => item.examples.map((example: any) => example.en));
  const japanese = plan.entries.flatMap((item: any) => item.examples.map((example: any) => example.ja));
  const words = await tx<Json[]>`
    SELECT id, word, also_known_as, category, part_of_speech, pronunciation,
           image_url, audio_url, cefr_level, status, collocations, note,
           chinese_definition, image_source_url, image_license, image_credit,
           etymology, forms, deleted_at
    FROM words WHERE id = ANY(${ids}) ORDER BY id FOR UPDATE
  `;
  const expectedWords = plan.entries.map((item: any) => ({
    id: item.word.id,
    word: item.word.word,
    category: item.word.category,
    part_of_speech: item.word.partOfSpeech,
    pronunciation: item.word.pronunciation,
    image_url: publicObjectUrl("word-images", item.image.storagePath),
    audio_url:
      phase === "published"
        ? publicObjectUrl(
            "word-audio",
            item.headwordAudio.find((audio: any) => audio.locale === "en-US").storagePath,
          )
        : null,
    cefr_level: null,
    status: phase,
    also_known_as: [],
    collocations: [],
    note: null,
    chinese_definition: item.word.chineseDefinition,
    image_source_url: null,
    image_license: item.image.license,
    image_credit: item.image.credit,
    etymology: null,
    forms: [],
    deleted_at: null,
  }));
  assertRowSet("word rows", words, expectedWords);

  const definitions = await tx<Json[]>`
    SELECT word_id, language, definition, cefr_level, sort_order
    FROM word_definitions WHERE word_id = ANY(${ids}) FOR UPDATE
  `;
  const expectedDefinitions = plan.entries.flatMap((item: any) =>
    item.word.definitions.map((definition: any) => ({
      word_id: item.word.id,
      language: definition.language,
      definition: definition.definition,
      cefr_level: null,
      sort_order: definition.sortOrder,
    })),
  );
  assertRowSet("definitions", definitions, expectedDefinitions);

  const terms = await tx<Json[]>`
    SELECT word_id, language, term, reading, pronunciation, reading_segments, audio_url
    FROM word_terms WHERE word_id = ANY(${ids}) FOR UPDATE
  `;
  const expectedTerms = plan.entries.flatMap((item: any) => [
    {
      word_id: item.word.id,
      language: "en",
      term: item.word.word,
      reading: null,
      pronunciation: item.word.pronunciation,
      reading_segments: null,
      audio_url: null,
    },
    {
      word_id: item.word.id,
      language: "ja",
      term: item.word.ja,
      reading: item.word.jaReading,
      pronunciation: item.word.jaReading,
      reading_segments: item.word.jaReadingSegments,
      audio_url:
        phase === "published"
          ? publicObjectUrl(
              "word-audio",
              item.headwordAudio.find((audio: any) => audio.locale === "ja-JP").storagePath,
            )
          : null,
    },
  ]);
  assertRowSet("headword terms", terms, expectedTerms);

  const examples = await tx<Json[]>`
    SELECT id::text, word_id, sentence, cefr_level, sort_order
    FROM word_examples WHERE word_id = ANY(${ids}) FOR UPDATE
  `;
  const expectedExamples = plan.entries.flatMap((item: any) =>
    item.examples.map((example: any) => ({
      id: exampleIds[example.ownerKey],
      word_id: item.word.id,
      sentence: example.en,
      cefr_level: example.cefrLevel,
      sort_order: example.sortOrder,
    })),
  );
  assertRowSet("examples", examples, expectedExamples);

  const translations = await tx<Json[]>`
    SELECT t.example_id::text, t.language, t.translation
    FROM word_example_translations t
    JOIN word_examples e ON e.id = t.example_id
    WHERE e.word_id = ANY(${ids})
    FOR UPDATE OF t
  `;
  const expectedTranslations = plan.entries.flatMap((item: any) =>
    item.examples.flatMap((example: any) => [
      { example_id: exampleIds[example.ownerKey], language: "ja", translation: example.ja },
      { example_id: exampleIds[example.ownerKey], language: "zh", translation: example.zh },
    ]),
  );
  assertRowSet("example translations", translations, expectedTranslations);

  const relations = await tx<Json[]>`
    SELECT source_word_id, target_word_id, relation_type, note
    FROM word_relations WHERE source_word_id = ANY(${ids}) FOR UPDATE
  `;
  const expectedRelations = plan.entries.flatMap((item: any) =>
    item.word.relatedWords.map((targetId: string) => ({
      source_word_id: item.word.id,
      target_word_id: targetId,
      relation_type: "see-also",
      note: null,
    })),
  );
  assertRowSet("word relations", relations, expectedRelations);

  const categoryLinks = await tx<Json[]>`
    SELECT word_id, category_id, is_primary
    FROM word_categories WHERE word_id = ANY(${ids}) FOR UPDATE
  `;
  const expectedCategoryLinks = plan.entries.map((item: any) => ({
    word_id: item.word.id,
    category_id: "drugstore",
    is_primary: true,
  }));
  assertRowSet("category links", categoryLinks, expectedCategoryLinks);

  const categoryRows = await tx<Json[]>`
    SELECT id, name, name_zh, emoji, description, description_en, color, image_url
    FROM categories WHERE id = ${plan.category.id} FOR UPDATE
  `;
  assertRowSet("drugstore category", categoryRows, [expectedCategory(plan)]);
  const categoryTranslations = manifest.categoryExistedBefore
    ? await tx<Json[]>`
        SELECT category_id, language, name, description
        FROM category_translations
        WHERE category_id = ${plan.category.id} AND language = 'ja'
        FOR UPDATE
      `
    : await tx<Json[]>`
        SELECT category_id, language, name, description
        FROM category_translations
        WHERE category_id = ${plan.category.id}
        FOR UPDATE
      `;
  assertRowSet("drugstore category translation", categoryTranslations, [{
    category_id: plan.category.id,
    language: "ja",
    name: plan.category.nameJa,
    description: plan.category.descriptionJa,
  }]);

  const catalogue = new Map<string, string>();
  for (const row of await tx<{ word_id: string; term: string }[]>`
    SELECT word_id, lower(term) AS term FROM word_terms ORDER BY word_id
  `) {
    if (!catalogue.has(row.term)) catalogue.set(row.term, row.word_id);
  }

  const spans = await tx<Json[]>`
    SELECT sentence_language, sentence, sort_order, text, base_form,
           part_of_speech, reading, word_id, version
    FROM sentence_spans
    WHERE (sentence_language = 'en' AND sentence = ANY(${english}))
       OR (sentence_language = 'ja' AND sentence = ANY(${japanese}))
    FOR UPDATE
  `;
  const expectedSpans = plan.entries.flatMap((item: any) =>
    item.examples.flatMap((example: any) =>
      ([
        ["en", example.en, example.spans.en],
        ["ja", example.ja, example.spans.ja],
      ] as const).flatMap(([language, sentence, sentenceSpans]) =>
        sentenceSpans.map((span: any, sortOrder: number) => ({
          sentence_language: language,
          sentence,
          sort_order: sortOrder,
          text: span.t,
          base_form: span.b ?? null,
          part_of_speech: span.p ?? null,
          reading: span.r ?? null,
          word_id: span.z
            ? (catalogue.get(String(span.b ?? span.t).toLowerCase().trim()) ?? null)
            : null,
          version: SPANS_VERSION,
        })),
      ),
    ),
  );
  assertRowSet("sentence spans", spans, expectedSpans);

  const glosses = await tx<Json[]>`
    SELECT g.sentence_language, g.sentence, g.sort_order, g.language, g.gloss
    FROM sentence_span_glosses g
    WHERE (g.sentence_language = 'en' AND g.sentence = ANY(${english}))
       OR (g.sentence_language = 'ja' AND g.sentence = ANY(${japanese}))
    FOR UPDATE
  `;
  const expectedGlosses = plan.entries.flatMap((item: any) =>
    item.examples.flatMap((example: any) =>
      ([
        ["en", example.en, example.spans.en],
        ["ja", example.ja, example.spans.ja],
      ] as const).flatMap(([language, sentence, sentenceSpans]) =>
        sentenceSpans.flatMap((span: any, sortOrder: number) =>
          ([
            ["zh-Hant", span.z],
            ["ja", span.j],
            ["en", span.e],
          ] as const)
            .filter(([, gloss]) => Boolean(gloss))
            .map(([glossLanguage, gloss]) => ({
              sentence_language: language,
              sentence,
              sort_order: sortOrder,
              language: glossLanguage,
              gloss,
            })),
        ),
      ),
    ),
  );
  assertRowSet("sentence glosses", glosses, expectedGlosses);

  const wordTags = await tx<Json[]>`
    SELECT word_id, tag_id FROM word_tags WHERE word_id = ANY(${ids}) FOR UPDATE
  `;
  assertRowSet("word tags", wordTags, []);
  const localizedTexts = await tx<Json[]>`
    SELECT word_id, field, language, value
    FROM word_localized_texts WHERE word_id = ANY(${ids}) FOR UPDATE
  `;
  assertRowSet("localized word texts", localizedTexts, []);

  const wordMedia = await tx<Json[]>`
    SELECT word_id, kind, url, storage_path, mime_type, width, height,
           duration_ms, source_url, license, credit, prompt, model, locale,
           is_primary, sort_order, metadata
    FROM word_media WHERE word_id = ANY(${ids}) FOR UPDATE
  `;
  const expectedWordMedia = phase === "draft" ? [] : plan.entries.flatMap((item: any) => [
    {
      word_id: item.word.id,
      kind: "image",
      url: publicObjectUrl("word-images", item.image.storagePath),
      storage_path: item.image.storagePath,
      mime_type: item.image.mimeType,
      width: item.image.width,
      height: item.image.height,
      duration_ms: null,
      source_url: null,
      license: item.image.license,
      credit: item.image.credit,
      prompt: null,
      model: "imagegen",
      locale: null,
      is_primary: true,
      sort_order: 0,
      metadata: { sha256: item.image.contentSha256, sourceFile: item.image.sourceFile },
    },
    ...item.headwordAudio.map((audio: any) => ({
      word_id: item.word.id,
      kind: "audio",
      url: publicObjectUrl("word-audio", audio.storagePath),
      storage_path: audio.storagePath,
      mime_type: audio.mimeType,
      width: null,
      height: null,
      duration_ms: null,
      source_url: null,
      license: null,
      credit: null,
      prompt: null,
      model: audio.model,
      locale: audio.locale,
      is_primary: false,
      sort_order: 0,
      metadata: {
        sourceText: audio.sourceText,
        sourceDigest: audio.sourceDigest,
        voice: audio.voice,
        sha256: audio.contentSha256,
        generatedAt: manifest.createdAt,
      },
    })),
  ]);
  assertRowSet("word media", wordMedia, expectedWordMedia);

  const exampleMedia = await tx<Json[]>`
    SELECT m.example_id::text, m.locale, m.url, m.storage_path, m.mime_type,
           m.duration_ms, m.model
    FROM word_example_media m
    JOIN word_examples e ON e.id = m.example_id
    WHERE e.word_id = ANY(${ids})
    FOR UPDATE OF m
  `;
  const expectedExampleMedia = phase === "draft" ? [] : plan.entries.flatMap((item: any) =>
    item.examples.flatMap((example: any) =>
      example.audio.map((audio: any) => {
        const concretePath = audio.storagePath.replace("{exampleId}", exampleIds[example.ownerKey]);
        return {
          example_id: exampleIds[example.ownerKey],
          locale: audio.locale,
          url: publicObjectUrl("word-audio", concretePath),
          storage_path: concretePath,
          mime_type: audio.mimeType,
          duration_ms: null,
          model: audio.model,
        };
      }),
    ),
  );
  assertRowSet("example media", exampleMedia, expectedExampleMedia);

  const cards = await tx<Json[]>`
    SELECT word_id, card_type, front, back, explanation, tags, deck_key
    FROM cards WHERE word_id = ANY(${ids}) FOR UPDATE
  `;
  const expectedCards = phase === "draft" ? [] : plan.entries.flatMap((item: any) => [
    {
      word_id: item.word.id,
      card_type: "回想卡",
      front: "",
      back: item.word.word,
      explanation: `${item.word.word} ${item.word.pronunciation} — ${item.word.chinese}`,
      tags: [item.word.category, item.word.partOfSpeech, "看圖選英文"],
      deck_key: "image-en",
    },
    {
      word_id: item.word.id,
      card_type: "回想卡",
      front: "",
      back: item.word.ja,
      explanation: `${item.word.ja} ${item.word.jaReading}`,
      tags: ["image", "ja"],
      deck_key: "image-ja",
    },
  ]);
  assertRowSet("cards", cards, expectedCards);
}

function buildStorageObjects(plan: any, exampleIds: Record<string, string>): StorageObjectPlan[] {
  const objects: StorageObjectPlan[] = [];
  const categoryImage = plan.category.image;
  objects.push({
    key: `${categoryImage.bucket}|${categoryImage.storagePath}`,
    bucket: categoryImage.bucket,
    storagePath: categoryImage.storagePath,
    url: publicObjectUrl(categoryImage.bucket, categoryImage.storagePath),
    localFile: categoryImage.localFile,
    bytes: categoryImage.bytes,
    contentSha256: categoryImage.contentSha256,
    mimeType: categoryImage.mimeType,
    existedBefore: false,
    uploadedByRun: false,
    uploadIntent: false,
    verified: false,
  });
  for (const item of plan.entries) {
    const add = (artifact: any, concretePath: string) => {
      objects.push({
        key: `${artifact.bucket}|${concretePath}`,
        bucket: artifact.bucket,
        storagePath: concretePath,
        url: publicObjectUrl(artifact.bucket, concretePath),
        localFile: artifact.localFile,
        bytes: artifact.bytes,
        contentSha256: artifact.contentSha256,
        mimeType: artifact.mimeType,
        existedBefore: false,
        uploadedByRun: false,
        uploadIntent: false,
        verified: false,
      });
    };
    add(item.image, item.image.storagePath);
    for (const audio of item.headwordAudio) add(audio, audio.storagePath);
    for (const example of item.examples) {
      const exampleId = exampleIds[example.ownerKey];
      if (!exampleId) throw new Error(`${example.ownerKey}: unresolved example ID`);
      for (const audio of example.audio) {
        add(audio, audio.storagePath.replace("{exampleId}", exampleId));
      }
    }
  }
  if (objects.length !== plan.summary.storageObjects ||
      new Set(objects.map(({ key }) => key)).size !== plan.summary.storageObjects) {
    throw new Error("resolved Storage object plan is incomplete or duplicated");
  }
  return objects;
}

async function verifyRemoteObject(object: StorageObjectPlan) {
  const response = await fetch(object.url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${object.key}: remote HTTP ${response.status}`);
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== object.mimeType) {
    throw new Error(`${object.key}: remote content type ${contentType ?? "missing"} differs from ${object.mimeType}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== object.bytes || sha256(bytes) !== object.contentSha256) {
    throw new Error(`${object.key}: remote bytes do not match the local artifact`);
  }
}

async function verifyAllRemoteObjects(objects: StorageObjectPlan[]) {
  for (let index = 0; index < objects.length; index += 20) {
    await Promise.all(objects.slice(index, index + 20).map(verifyRemoteObject));
  }
}

async function stageStorage(manifestFile: string, manifest: ApplyManifest) {
  const existingByBucket = new Map([
    ["word-images", new Set(await listPublicObjects("word-images", ""))],
    ["word-audio", new Set(await listPublicObjects("word-audio", ""))],
  ]);
  manifest.status = "uploading";
  manifest.updatedAt = new Date().toISOString();
  writeJsonAtomic(manifestFile, manifest);
  for (const [index, object] of manifest.storageObjects.entries()) {
    if (object.verified) {
      await verifyRemoteObject(object);
      continue;
    }
    const existing = existingByBucket.get(object.bucket)!.has(object.storagePath);
    if (existing) {
      await verifyRemoteObject(object);
      // An earlier interrupted attempt may have completed the PUT after it
      // journaled intent but before it journaled success.
      if (object.uploadIntent) object.uploadedByRun = true;
      else object.existedBefore = true;
    } else {
      const localBytes = fs.readFileSync(path.resolve(ROOT, object.localFile));
      object.existedBefore = false;
      object.uploadIntent = true;
      manifest.updatedAt = new Date().toISOString();
      writeJsonAtomic(manifestFile, manifest);
      const url = await putPublicObject(object.bucket, object.storagePath, localBytes, {
        contentType:
          object.bucket === "word-images" ? WORD_IMAGE_CONTENT_TYPE : object.mimeType,
        upsert: false,
        requireAbsent: true,
      });
      if (url !== object.url) throw new Error(`${object.key}: writer returned an unexpected URL`);
      object.uploadedByRun = true;
      await verifyRemoteObject(object);
    }
    object.verified = true;
    manifest.updatedAt = new Date().toISOString();
    writeJsonAtomic(manifestFile, manifest);
    if ((index + 1) % 25 === 0 || index + 1 === manifest.storageObjects.length) {
      console.log(`[drugstore:publish] Storage ${index + 1}/${manifest.storageObjects.length}`);
    }
  }
  manifest.status = "uploaded";
  manifest.updatedAt = new Date().toISOString();
  writeJsonAtomic(manifestFile, manifest);
}

async function publishDraft(tx: Tx, plan: any, manifest: ApplyManifest) {
  const ids = plan.entries.map((item: any) => item.word.id);
  const states = await tx<{ id: string; status: string }[]>`
    SELECT id, status FROM words WHERE id = ANY(${ids}) FOR UPDATE
  `;
  if (states.length !== plan.summary.words || states.some(({ status }) => status !== "draft")) {
    throw new Error(`publish refused: all ${plan.summary.words} drugstore rows must still be draft`);
  }
  const resolved = await resolveDraftExampleIds(tx, plan);
  if (!sameValue(resolved, manifest.resolvedExampleIds)) {
    throw new Error("publish refused: example IDs changed after Storage staging");
  }
  await assertStoredContentMatchesPlan(tx, plan, resolved, manifest, "draft");
  const objectByKey = new Map(manifest.storageObjects.map((object) => [object.key, object]));
  for (const item of plan.entries) {
    const image = objectByKey.get(`${item.image.bucket}|${item.image.storagePath}`)!;
    await tx`
      INSERT INTO word_media (
        word_id, kind, url, storage_path, mime_type, width, height,
        license, credit, model, is_primary, sort_order, metadata
      ) VALUES (
        ${item.word.id}, 'image', ${image.url}, ${image.storagePath}, ${image.mimeType},
        ${item.image.width}, ${item.image.height}, ${item.image.license}, ${item.image.credit},
        'imagegen', TRUE, 0,
        ${tx.json({ sha256: image.contentSha256, sourceFile: item.image.sourceFile })}
      )
    `;
    for (const audio of item.headwordAudio) {
      const object = objectByKey.get(`${audio.bucket}|${audio.storagePath}`)!;
      await tx`
        INSERT INTO word_media (
          word_id, kind, url, storage_path, mime_type, model, locale, metadata
        ) VALUES (
          ${item.word.id}, 'audio', ${object.url}, ${object.storagePath}, ${object.mimeType},
          ${audio.model}, ${audio.locale},
          ${tx.json({
            sourceText: audio.sourceText,
            sourceDigest: audio.sourceDigest,
            voice: audio.voice,
            sha256: audio.contentSha256,
            generatedAt: manifest.createdAt,
          })}
        )
      `;
      if (audio.locale === "en-US") {
        await tx`UPDATE words SET audio_url = ${object.url} WHERE id = ${item.word.id}`;
      } else if (audio.locale === "ja-JP") {
        await tx`
          UPDATE word_terms SET audio_url = ${object.url}, updated_at = now()
          WHERE word_id = ${item.word.id} AND language = 'ja'
        `;
      }
    }
    for (const example of item.examples) {
      const exampleId = manifest.resolvedExampleIds[example.ownerKey];
      for (const audio of example.audio) {
        const concretePath = audio.storagePath.replace("{exampleId}", exampleId);
        const object = objectByKey.get(`${audio.bucket}|${concretePath}`)!;
        await tx`
          INSERT INTO word_example_media (
            example_id, locale, url, storage_path, mime_type, model
          ) VALUES (
            ${exampleId}, ${audio.locale}, ${object.url}, ${object.storagePath},
            ${object.mimeType}, ${audio.model}
          )
        `;
      }
    }
    await tx`
      INSERT INTO cards (word_id, card_type, front, back, explanation, tags, deck_key)
      VALUES (
        ${item.word.id}, '回想卡', '', ${item.word.word},
        ${`${item.word.word} ${item.word.pronunciation} — ${item.word.chinese}`},
        ${[item.word.category, item.word.partOfSpeech, "看圖選英文"]}, 'image-en'
      )
    `;
    await tx`
      INSERT INTO cards (word_id, card_type, front, back, explanation, tags, deck_key)
      VALUES (
        ${item.word.id}, '回想卡', '', ${item.word.ja},
        ${`${item.word.ja} ${item.word.jaReading}`}, ${["image", "ja"]}, 'image-ja'
      )
    `;
  }
  const published = await tx<{ id: string }[]>`
    UPDATE words SET status = 'published', updated_at = now()
    WHERE id = ANY(${ids}) AND status = 'draft'
    RETURNING id
  `;
  if (published.length !== plan.summary.words) {
    throw new Error(`publish refused: expected to publish ${plan.summary.words} rows, changed ${published.length}`);
  }
  await assertStoredContentMatchesPlan(tx, plan, resolved, manifest, "published");
}

async function countUserReferences(sql: Sql | Tx, ids: string[]) {
  const [row] = await sql<Record<string, number>[]>`
    SELECT
      (SELECT count(*)::int FROM user_cards uc JOIN cards c ON c.id = uc.card_id WHERE c.word_id = ANY(${ids})) AS user_cards,
      (SELECT count(*)::int FROM user_favorites WHERE word_id = ANY(${ids})) AS user_favorites,
      (SELECT count(*)::int FROM user_learned WHERE word_id = ANY(${ids})) AS user_learned,
      (SELECT count(*)::int FROM user_words WHERE word_id = ANY(${ids})) AS user_words,
      (SELECT count(*)::int FROM study_logs WHERE word_id = ANY(${ids})) AS study_logs,
      (SELECT count(*)::int FROM study_reports WHERE word_id = ANY(${ids})) AS study_reports,
      (SELECT count(*)::int FROM user_atlas_items WHERE canonical_word_id = ANY(${ids})) AS user_atlas_items,
      (SELECT count(*)::int FROM user_settings
        WHERE study_category = 'drugstore'
           OR 'drugstore' = ANY(regexp_split_to_array(study_categories, '\\s*,\\s*'))
      ) AS user_settings
  `;
  return row;
}

async function rollback(
  sql: Sql,
  manifestFile: string,
  manifest: ApplyManifest,
  planFile: string,
  plan: any,
) {
  assertWriteConfirmation(
    manifest.databaseHostFingerprint,
    manifest.storageTargetFingerprint,
  );
  if (manifest.storageBackend !== writeBackend()) {
    throw new Error("rollback refused: Storage backend differs from the apply manifest");
  }
  if (manifest.storageTargetFingerprint !== currentStorageTargetFingerprint()) {
    throw new Error("rollback refused: physical Storage target differs from the apply manifest");
  }
  if (![
    "draft-inserted",
    "uploading",
    "uploaded",
    "applied",
    "failed",
    "rolling-back",
    "rollback-failed",
  ].includes(manifest.status)) {
    throw new Error(`rollback refused from manifest status ${manifest.status}`);
  }
  if (sha256(fs.readFileSync(planFile)) !== manifest.planSha256) {
    throw new Error("rollback refused: publish plan digest changed");
  }
  const ids = plan.entries.map((item: any) => item.word.id);
  manifest.status = "rolling-back";
  manifest.updatedAt = new Date().toISOString();
  writeJsonAtomic(manifestFile, manifest);
  const english = plan.entries.flatMap((item: any) => item.examples.map((example: any) => example.en));
  const japanese = plan.entries.flatMap((item: any) => item.examples.map((example: any) => example.ja));
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
      // These tables contain logical (non-FK) links to words/sentences or the
      // category preference. Freeze their writers for the short rollback
      // transaction so no new reference can slip in after the CAS checks.
      await tx.unsafe(`
        LOCK TABLE word_relations, sentence_spans, word_definitions,
          word_examples, word_example_translations, category_translations,
          user_settings
        IN SHARE ROW EXCLUSIVE MODE
      `);
      const states = await tx<{ id: string; status: string }[]>`
        SELECT id, status FROM words WHERE id = ANY(${ids}) FOR UPDATE
      `;
      if (states.length === 0) return;
      if (states.length !== ids.length) {
        throw new Error("rollback refused: only part of the drugstore series exists");
      }
      const phase = states.every(({ status }) => status === "published")
        ? "published"
        : states.every(({ status }) => status === "draft")
          ? "draft"
          : null;
      if (!phase) throw new Error("rollback refused: drugstore row states are mixed");

      const resolved = await resolveDraftExampleIds(tx, plan);
      if (!sameValue(resolved, manifest.resolvedExampleIds)) {
        throw new Error("rollback refused: live example identity differs from the applied manifest");
      }
      await assertStoredContentMatchesPlan(tx, plan, resolved, manifest, phase);

      const userReferences = await countUserReferences(tx, ids);
      const userReferenceCount = Object.values(userReferences).reduce(
        (sum, value) => sum + Number(value),
        0,
      );
      if (userReferenceCount > 0) {
        throw new Error(
          `rollback refused: ${userReferenceCount} user-data references exist`,
        );
      }
      const outsideReuse = await tx<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM word_examples e
        WHERE e.word_id <> ALL(${ids})
          AND (e.sentence = ANY(${english}) OR e.id IN (
            SELECT t.example_id FROM word_example_translations t
            WHERE t.language = 'ja' AND t.translation = ANY(${japanese})
          ))
      `;
      if (outsideReuse[0].count > 0) {
        throw new Error("rollback refused: a drugstore sentence is now reused outside the series");
      }
      const sharedDefinitions = await tx<{ word_id: string }[]>`
        SELECT word_id
        FROM word_definitions
        WHERE word_id <> ALL(${ids})
          AND ((language = 'en' AND definition = ANY(${english}))
            OR (language = 'ja' AND definition = ANY(${japanese})))
        FOR UPDATE
      `;
      if (sharedDefinitions.length > 0) {
        throw new Error("rollback refused: a drugstore sentence is reused by an outside definition");
      }
      const inboundRelations = await tx<{ source_word_id: string; target_word_id: string }[]>`
        SELECT source_word_id, target_word_id
        FROM word_relations
        WHERE target_word_id = ANY(${ids}) AND source_word_id <> ALL(${ids})
        FOR UPDATE
      `;
      if (inboundRelations.length > 0) {
        throw new Error("rollback refused: outside words now link to the drugstore series");
      }
      const outsideSpanLinks = await tx<{
        sentence_language: string;
        sentence: string;
        sort_order: number;
      }[]>`
        SELECT sentence_language, sentence, sort_order
        FROM sentence_spans
        WHERE word_id = ANY(${ids})
          AND NOT (
            (sentence_language = 'en' AND sentence = ANY(${english}))
            OR (sentence_language = 'ja' AND sentence = ANY(${japanese}))
          )
        FOR UPDATE
      `;
      if (outsideSpanLinks.length > 0) {
        throw new Error("rollback refused: outside sentence spans now link to the drugstore series");
      }
      await tx`
        DELETE FROM sentence_spans
        WHERE (sentence_language = 'en' AND sentence = ANY(${english}))
           OR (sentence_language = 'ja' AND sentence = ANY(${japanese}))
      `;
      await tx`DELETE FROM words WHERE id = ANY(${ids})`;
      if (!manifest.categoryExistedBefore) {
        await tx`DELETE FROM categories WHERE id = ${plan.category.id}`;
      }
    });

    // Immutable content-addressed objects are intentionally retained. Their
    // manifest is the cleanup inventory; deleting here would require proving
    // cross-run ownership, which object stores cannot do atomically.
    manifest.status = "rolled-back-storage-retained";
    manifest.rolledBackAt = new Date().toISOString();
    manifest.updatedAt = manifest.rolledBackAt;
    writeJsonAtomic(manifestFile, manifest);
    console.log(
      `[drugstore:publish] rolled back ${ids.length} words; ` +
        `${manifest.storageObjects.filter(({ uploadedByRun }) => uploadedByRun).length} ` +
        `content-addressed Storage objects retained for separately audited cleanup`,
    );
  } catch (error) {
    manifest.status = "rollback-failed";
    manifest.failure = error instanceof Error ? error.message : String(error);
    manifest.updatedAt = new Date().toISOString();
    writeJsonAtomic(manifestFile, manifest);
    throw error;
  }
}

async function main() {
  if (ROLLBACK_FILE && (APPLY || RESUME_FILE)) {
    throw new Error("do not combine --rollback with --apply or --resume");
  }
  if (RESUME_FILE && !APPLY) throw new Error("--resume requires --apply");

  const actionManifestArgument = ROLLBACK_FILE ?? RESUME_FILE;
  const actionManifestFile = actionManifestArgument
    ? path.resolve(ROOT, actionManifestArgument)
    : null;
  const actionManifest = actionManifestFile
    ? readJson<ApplyManifest>(actionManifestFile)
    : null;
  if (
    actionManifest &&
    (actionManifest.schemaVersion !== 1 || actionManifest.series !== "drugstore")
  ) {
    throw new Error("invalid drugstore recovery manifest");
  }
  const planFile = PLAN_ARGUMENT
    ? path.resolve(ROOT, PLAN_ARGUMENT)
    : actionManifest
      ? path.resolve(ROOT, actionManifest.planFile)
      : DEFAULT_PLAN_FILE;
  const planBytes = fs.readFileSync(planFile);
  const plan = JSON.parse(planBytes.toString("utf8"));
  const { planSha256 } = verifyPreparedPlan(plan, planBytes);
  const { databaseUrl, hostFingerprint } = databaseConfig();
  // Apply/dry-run need a usable writer. Rollback is deliberately DB-only and
  // must remain recoverable even if Storage credentials are temporarily down.
  if (!ROLLBACK_FILE) assertWriterConfigured();
  const storageTargetFingerprint = currentStorageTargetFingerprint();
  if (plan.databasePreflight?.databaseHostFingerprint !== hostFingerprint ||
      plan.storageTarget?.fingerprint !== storageTargetFingerprint) {
    throw new Error("publish plan targets differ from its reviewed database or physical Storage preflight");
  }
  const sql = postgres(databaseUrl, { ssl: "require", prepare: false, max: 1 });
  try {
    if (ROLLBACK_FILE) {
      const manifestFile = actionManifestFile!;
      const manifest = actionManifest!;
      if (manifest.databaseHostFingerprint !== hostFingerprint) {
        throw new Error("rollback manifest belongs to a different logical database");
      }
      await rollback(sql, manifestFile, manifest, planFile, plan);
      return;
    }

    const preflight = await inspectDatabase(sql, plan);
    console.log(
      JSON.stringify(
        {
          mode: APPLY ? "apply" : "dry-run",
          databaseHostFingerprint: hostFingerprint,
          storageBackend: writeBackend(),
          storageTargetFingerprint,
          words: plan.summary.words,
          examples: plan.summary.examples,
          storageObjects: plan.summary.storageObjects,
          missingTables: preflight.missingTables,
          candidateRows: preflight.words.length,
          candidateStates: Object.fromEntries(
            [...new Set(preflight.words.map((row: any) => String(row.status)))].map((status) => [
              status,
              preflight.words.filter((row: any) => row.status === status).length,
            ]),
          ),
          headwordConflicts: preflight.headwordConflicts.length,
          spanCollisions: preflight.spanCollisions.length,
          categoryExists: Boolean(preflight.category),
          categoryMatches: preflight.categoryMatches,
          categoryTranslationMatches: preflight.categoryTranslationMatches,
          writeReady: preflight.writeReady,
        },
        null,
        2,
      ),
    );
    if (!preflight.writeReady) throw new Error("database preflight failed");
    if (!APPLY) {
      console.log(
        `[drugstore:publish] dry run only; no Storage or database changes. ` +
          `A separately authorized apply must pass --apply ` +
          `--confirm-host ${hostFingerprint} ` +
          `--confirm-storage ${storageTargetFingerprint}`,
      );
      return;
    }
    assertWriteConfirmation(hostFingerprint, storageTargetFingerprint);
    if (preflight.alreadyPublished && !RESUME_FILE) {
      throw new Error("all drugstore rows are already published; use the audit workflow instead");
    }
    if (preflight.resumableDraft) {
      throw new Error(
        "committed drugstore drafts are from an obsolete publisher flow; rollback them before continuing",
      );
    }

    const manifestFile = actionManifestFile ?? path.join(
      path.dirname(planFile),
      `apply-manifest-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    );
    const manifest: ApplyManifest = actionManifest ?? {
      schemaVersion: 1,
      series: "drugstore",
      status: "prepared",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      databaseHostFingerprint: hostFingerprint,
      storageBackend: writeBackend(),
      storageTargetFingerprint,
      planFile: relative(planFile),
      planSha256,
      categoryExistedBefore: Boolean(preflight.category),
      categoryBefore: preflight.category,
      resolvedExampleIds: {},
      storageObjects: [],
    };
    if (actionManifest) {
      if (manifest.databaseHostFingerprint !== hostFingerprint) {
        throw new Error("resume manifest belongs to a different logical database");
      }
      if (manifest.storageBackend !== writeBackend()) {
        throw new Error("resume refused: Storage backend differs from the apply manifest");
      }
      if (manifest.storageTargetFingerprint !== currentStorageTargetFingerprint()) {
        throw new Error("resume refused: physical Storage target differs from the apply manifest");
      }
      if (manifest.planSha256 !== planSha256) {
        throw new Error("resume refused: publish plan digest changed");
      }
      if (!["prepared", "ids-reserved", "uploading", "uploaded", "failed"].includes(manifest.status)) {
        throw new Error(`resume refused from manifest status ${manifest.status}`);
      }
    } else {
      writeJsonAtomic(manifestFile, manifest);
    }
    try {
      if (preflight.newSeries && Object.keys(manifest.resolvedExampleIds).length === 0) {
        manifest.resolvedExampleIds = await reserveExampleIds(sql, plan);
      } else if (preflight.alreadyPublished) {
        const resolved = await resolveDraftExampleIds(sql, plan);
        if (!sameValue(resolved, manifest.resolvedExampleIds)) {
          throw new Error("resume refused: stored example identity differs from the manifest");
        }
      }
      const expectedStorageObjects = buildStorageObjects(plan, manifest.resolvedExampleIds);
      if (manifest.storageObjects.length === 0) {
        manifest.storageObjects = expectedStorageObjects;
      } else {
        assertRowSet(
          "manifest Storage plan",
          manifest.storageObjects.map(({ key, bucket, storagePath, url, localFile, bytes, contentSha256, mimeType }) => ({
            key, bucket, storagePath, url, localFile, bytes, contentSha256, mimeType,
          })),
          expectedStorageObjects.map(({ key, bucket, storagePath, url, localFile, bytes, contentSha256, mimeType }) => ({
            key, bucket, storagePath, url, localFile, bytes, contentSha256, mimeType,
          })),
        );
      }
      if (preflight.alreadyPublished) {
        await verifyAllRemoteObjects(manifest.storageObjects);
        await sql.begin((tx) =>
          assertStoredContentMatchesPlan(
            tx,
            plan,
            manifest.resolvedExampleIds,
            manifest,
            "published",
          ),
        );
        manifest.status = "applied";
        manifest.failure = undefined;
        manifest.appliedAt ??= new Date().toISOString();
        manifest.updatedAt = new Date().toISOString();
        writeJsonAtomic(manifestFile, manifest);
        console.log(
          `[drugstore:publish] recovered completed publication; manifest: ${relative(manifestFile)}`,
        );
        return;
      }
      manifest.status = "ids-reserved";
      manifest.failure = undefined;
      manifest.updatedAt = new Date().toISOString();
      writeJsonAtomic(manifestFile, manifest);
      await stageStorage(manifestFile, manifest);
      await verifyAllRemoteObjects(manifest.storageObjects);
      await sql.begin(async (tx) => {
        await insertDraftContent(tx, plan, manifest.resolvedExampleIds);
        await publishDraft(tx, plan, manifest);
      });
      manifest.status = "applied";
      manifest.appliedAt = new Date().toISOString();
      manifest.updatedAt = manifest.appliedAt;
      writeJsonAtomic(manifestFile, manifest);
      console.log(`[drugstore:publish] published ${plan.summary.words} words; manifest: ${relative(manifestFile)}`);
    } catch (error) {
      manifest.status = "failed";
      manifest.failure = error instanceof Error ? error.message : String(error);
      manifest.updatedAt = new Date().toISOString();
      writeJsonAtomic(manifestFile, manifest);
      throw new Error(`${manifest.failure}; recovery manifest: ${relative(manifestFile)}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("[drugstore:publish] failed:", error);
  process.exitCode = 1;
});
