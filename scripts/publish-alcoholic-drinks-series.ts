// Guarded one-time publisher for the reviewed alcoholic-drinks series.
//
// The default invocation is SELECT-only. Production writes require --apply
// plus both fingerprints printed by a fresh dry run. The release inserts 33
// words and updates the existing sake row in one serializable transaction,
// preserving sake's word ID, example IDs, and card IDs.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { SPANS_VERSION } from "../lib/example-spans";
import { WORD_IMAGE_CONTENT_TYPE } from "../lib/word-image-encode";
import {
  assertWriterConfigured,
  putPublicObject,
  writeBackend,
} from "../lib/storage/public-writer";
import { publicObjectUrl } from "../lib/storage/public-objects";

const ROOT = process.cwd();
const DEFAULT_PLAN_FILE = path.resolve(ROOT, "output/alcoholic-drinks-publish-prep/publish-plan.json");
const PLAN_ARGUMENT = argument("--plan");
const APPLY = process.argv.includes("--apply");
const ROLLBACK_FILE = argument("--rollback");
const RESUME_FILE = argument("--resume");
const CONFIRMED_HOST = argument("--confirm-host");
const CONFIRMED_STORAGE = argument("--confirm-storage");
const ALLOW_USER_DATA_LOSS = process.argv.includes("--allow-user-data-loss");
const EXISTING_ID = "sake";

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
  uploadRequired: boolean;
  existedBefore: boolean;
  uploadedByRun: boolean;
  uploadIntent: boolean;
  verified: boolean;
}

interface ApplyManifest {
  schemaVersion: 1;
  series: "alcoholic-drinks";
  status:
    | "prepared"
    | "ids-reserved"
    | "uploading"
    | "uploaded"
    | "applied"
    | "failed"
    | "rolling-back"
    | "rollback-failed"
    | "rolled-back-storage-retained";
  createdAt: string;
  updatedAt: string;
  databaseHostFingerprint: string;
  storageBackend: "r2" | "supabase";
  storageTargetFingerprint: string;
  planFile: string;
  planSha256: string;
  resolvedExampleIds: Record<string, string>;
  storageObjects: StorageObjectPlan[];
  sakeBeforeDigest: string;
  sakeAfterDigest?: string;
  insertedSeriesAfterDigest?: string;
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

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Json)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return sha256(JSON.stringify(canonical(value)));
}

function sameValue(left: unknown, right: unknown): boolean {
  return digest(left) === digest(right);
}

function assertRowSet(label: string, actual: unknown[], expected: unknown[]) {
  const normalize = (rows: unknown[]) => rows.map((row) => JSON.stringify(canonical(row))).sort();
  if (!sameValue(normalize(actual), normalize(expected))) {
    throw new Error(`${label} differ from the immutable plan (actual ${actual.length}, expected ${expected.length})`);
  }
}

function databaseConfig() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("missing DATABASE_URL");
  const parsed = new URL(databaseUrl);
  return {
    databaseUrl,
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
    : { backend, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "" };
  return sha256(JSON.stringify(identity)).slice(0, 12);
}

function assertWriteConfirmation(hostFingerprint: string, storageFingerprint: string) {
  if (CONFIRMED_HOST !== hostFingerprint) {
    throw new Error(`write refused: pass --confirm-host ${hostFingerprint} from a fresh dry run`);
  }
  if (CONFIRMED_STORAGE !== storageFingerprint) {
    throw new Error(`write refused: pass --confirm-storage ${storageFingerprint} from a fresh dry run`);
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

function sentenceSets(plan: any) {
  return {
    english: plan.entries.flatMap((item: any) => item.examples.map((example: any) => example.en)),
    japanese: plan.entries.flatMap((item: any) => item.examples.map((example: any) => example.ja)),
  };
}

async function snapshotCatalog(sql: Sql | Tx, ids: string[], english: string[], japanese: string[]) {
  const words = await sql<Json[]>`
    SELECT id, word, also_known_as, category, part_of_speech, pronunciation,
           image_url, audio_url, cefr_level, status, collocations, note,
           chinese_definition, image_source_url, image_license, image_credit,
           etymology, forms, deleted_at
    FROM words WHERE id = ANY(${ids}) ORDER BY id
  `;
  const terms = await sql<Json[]>`
    SELECT word_id, language, term, reading, pronunciation, reading_segments, audio_url
    FROM word_terms WHERE word_id = ANY(${ids}) ORDER BY word_id, language
  `;
  const definitions = await sql<Json[]>`
    SELECT word_id, language, definition, cefr_level, sort_order
    FROM word_definitions WHERE word_id = ANY(${ids}) ORDER BY word_id, language, sort_order
  `;
  const examples = await sql<Json[]>`
    SELECT id::text, word_id, sentence, cefr_level, sort_order
    FROM word_examples WHERE word_id = ANY(${ids}) ORDER BY word_id, sort_order, id
  `;
  const exampleIds = examples.map(({ id }) => String(id));
  const translations = exampleIds.length === 0 ? [] : await sql<Json[]>`
    SELECT example_id::text, language, translation FROM word_example_translations
    WHERE example_id::text = ANY(${exampleIds}) ORDER BY example_id, language
  `;
  const spans = await sql<Json[]>`
    SELECT sentence_language, sentence, sort_order, text, base_form,
           part_of_speech, reading, word_id, version
    FROM sentence_spans
    WHERE (sentence_language = 'en' AND sentence = ANY(${english}))
       OR (sentence_language = 'ja' AND sentence = ANY(${japanese}))
    ORDER BY sentence_language, sentence, sort_order
  `;
  const glosses = await sql<Json[]>`
    SELECT sentence_language, sentence, sort_order, language, gloss
    FROM sentence_span_glosses
    WHERE (sentence_language = 'en' AND sentence = ANY(${english}))
       OR (sentence_language = 'ja' AND sentence = ANY(${japanese}))
    ORDER BY sentence_language, sentence, sort_order, language
  `;
  const relations = await sql<Json[]>`
    SELECT source_word_id, target_word_id, relation_type, note
    FROM word_relations WHERE source_word_id = ANY(${ids}) ORDER BY source_word_id, target_word_id
  `;
  const categories = await sql<Json[]>`
    SELECT word_id, category_id, is_primary
    FROM word_categories WHERE word_id = ANY(${ids}) ORDER BY word_id, category_id
  `;
  const media = await sql<Json[]>`
    SELECT word_id, kind, url, storage_path, mime_type, width, height,
           duration_ms, source_url, license, credit, prompt, model, locale,
           is_primary, sort_order, metadata
    FROM word_media WHERE word_id = ANY(${ids}) ORDER BY word_id, kind, locale, sort_order
  `;
  const exampleMedia = exampleIds.length === 0 ? [] : await sql<Json[]>`
    SELECT example_id::text, locale, url, storage_path, mime_type, duration_ms, model
    FROM word_example_media WHERE example_id::text = ANY(${exampleIds})
    ORDER BY example_id, locale
  `;
  const cards = await sql<Json[]>`
    SELECT id::text, word_id, card_type, front, back, explanation, tags, deck_key
    FROM cards WHERE word_id = ANY(${ids}) ORDER BY word_id, id
  `;
  return { words, terms, definitions, examples, translations, spans, glosses, relations, categories, media, exampleMedia, cards };
}

async function snapshotSake(sql: Sql | Tx) {
  const examples = await sql<{ sentence: string }[]>`
    SELECT sentence FROM word_examples WHERE word_id = ${EXISTING_ID} ORDER BY sort_order, id
  `;
  const japanese = await sql<{ translation: string }[]>`
    SELECT t.translation FROM word_example_translations t
    JOIN word_examples e ON e.id = t.example_id
    WHERE e.word_id = ${EXISTING_ID} AND t.language = 'ja'
    ORDER BY e.sort_order, e.id
  `;
  return snapshotCatalog(
    sql,
    [EXISTING_ID],
    examples.map(({ sentence }) => sentence),
    japanese.map(({ translation }) => translation),
  );
}

async function inspectDatabase(sql: Sql, plan: any) {
  const ids = plan.entries.map((item: any) => item.word.id);
  const newIds = plan.releaseShape.insertWordIds as string[];
  const lowerWords = plan.entries.map((item: any) => item.word.word.toLowerCase());
  const { english, japanese } = sentenceSets(plan);
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
  const missingTables = Object.entries(tables).filter(([, value]) => !value).map(([name]) => name);
  const candidateRows = await sql<Json[]>`
    SELECT id, word, category, status FROM words WHERE id = ANY(${ids}) ORDER BY id
  `;
  const newRows = candidateRows.filter(({ id }) => newIds.includes(String(id)));
  const sakeRow = candidateRows.find(({ id }) => id === EXISTING_ID);
  const headwordConflicts = await sql<Json[]>`
    SELECT id, word, status FROM words
    WHERE lower(word) = ANY(${lowerWords}) AND NOT (id = ANY(${ids})) ORDER BY id
  `;
  const category = await sql<Json[]>`
    SELECT id, name, name_zh, emoji, description, description_en, color, image_url
    FROM categories WHERE id = ${plan.category.id}
  `;
  const spanCollisions = await sql<Json[]>`
    SELECT DISTINCT sentence_language, sentence FROM sentence_spans
    WHERE (sentence_language = 'en' AND sentence = ANY(${english}))
       OR (sentence_language = 'ja' AND sentence = ANY(${japanese}))
    ORDER BY sentence_language, sentence
  `;
  const sake = await snapshotSake(sql);
  const sakeBeforeDigest = digest(sake);
  const fresh = newRows.length === 0 && category.length === 0;
  const alreadyApplied =
    newRows.length === newIds.length &&
    candidateRows.length === ids.length &&
    candidateRows.every(({ status, category: categoryId }) =>
      status === "published" && categoryId === "alcoholic-drinks",
    );
  return {
    missingTables,
    candidateRows,
    newRows,
    sakeRow,
    headwordConflicts,
    category: category[0] ?? null,
    spanCollisions,
    sake,
    sakeBeforeDigest,
    fresh,
    alreadyApplied,
    writeReady:
      missingTables.length === 0 &&
      headwordConflicts.length === 0 &&
      ((fresh &&
        sakeRow?.status === "published" &&
        sakeRow?.category === "seasonings" &&
        sakeBeforeDigest === plan.databasePreflight.sakeBeforeDigest &&
        spanCollisions.length === 0) ||
        alreadyApplied),
  };
}

function verifyPreparedPlan(plan: any, planBytes: Buffer) {
  if (
    plan.schemaVersion !== 1 ||
    plan.series !== "alcoholic-drinks" ||
    plan.productionWriteAllowed !== false ||
    plan.summary?.words !== 34 ||
    plan.summary?.insertedWords !== 33 ||
    plan.summary?.updatedWords !== 1 ||
    plan.summary?.examples !== 68 ||
    plan.summary?.audioClips !== 306 ||
    plan.summary?.storageArtifacts !== 341 ||
    !plan.databasePreflight?.readyForGuardedApply ||
    !Array.isArray(plan.entries) ||
    plan.entries.length !== 34
  ) {
    throw new Error("invalid or incomplete alcoholic-drinks publish plan");
  }
  for (const source of plan.sourceFiles) {
    const bytes = fs.readFileSync(path.resolve(ROOT, source.file));
    if (sha256(bytes) !== source.sha256) throw new Error(`${source.file}: source digest changed`);
  }
  const artifacts = [
    plan.category.image,
    ...plan.entries.flatMap((item: any) => [
      item.image,
      ...item.headwordAudio,
      ...item.examples.flatMap((example: any) => example.audio),
    ]),
  ];
  if (artifacts.length !== 341) throw new Error(`expected 341 artifacts, found ${artifacts.length}`);
  for (const artifact of artifacts) {
    const bytes = fs.readFileSync(path.resolve(ROOT, artifact.localFile));
    if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.contentSha256) {
      throw new Error(`${artifact.localFile}: local bytes no longer match the plan`);
    }
  }
  return { planSha256: sha256(planBytes) };
}

async function reserveNewExampleIds(sql: Sql, plan: any) {
  const owners = plan.entries
    .filter((item: any) => item.operation === "insert")
    .flatMap((item: any) => item.examples.map((example: any) => example.ownerKey));
  const rows = await sql<{ id: string }[]>`
    SELECT nextval(pg_get_serial_sequence('word_examples', 'id'))::text AS id
    FROM generate_series(1, ${owners.length})
  `;
  if (rows.length !== 66) throw new Error(`expected 66 reserved example IDs, found ${rows.length}`);
  return Object.fromEntries(owners.map((owner: string, index: number) => [owner, rows[index].id]));
}

function resolveSakeExampleIds(plan: any) {
  const oldExamples = plan.databasePreflight.sakeBefore.examples as Array<{ id: string; sort_order: number }>;
  if (oldExamples.length !== 2) throw new Error("sake must have exactly two stable example IDs");
  return Object.fromEntries(oldExamples.map((example) => [`sake:${example.sort_order}`, String(example.id)]));
}

function buildStorageObjects(plan: any, exampleIds: Record<string, string>): StorageObjectPlan[] {
  const artifacts = [
    plan.category.image,
    ...plan.entries.flatMap((item: any) => [
      item.image,
      ...item.headwordAudio,
      ...item.examples.flatMap((example: any) => example.audio),
    ]),
  ];
  const objects = artifacts.map((artifact: any) => {
    const concretePath = artifact.storagePath.replace(
      "{exampleId}",
      artifact.ownerKey ? (exampleIds[artifact.ownerKey] ?? "") : "",
    );
    if (concretePath.includes("{exampleId}") || concretePath.includes("//")) {
      throw new Error(`${artifact.ownerKey}: unresolved Storage path`);
    }
    return {
      key: `${artifact.bucket}|${concretePath}`,
      bucket: artifact.bucket,
      storagePath: concretePath,
      url: publicObjectUrl(artifact.bucket, concretePath),
      localFile: artifact.localFile,
      bytes: artifact.bytes,
      contentSha256: artifact.contentSha256,
      mimeType: artifact.mimeType,
      uploadRequired: artifact.uploadRequired !== false,
      existedBefore: false,
      uploadedByRun: false,
      uploadIntent: false,
      verified: false,
    } satisfies StorageObjectPlan;
  });
  if (objects.length !== 341 || new Set(objects.map(({ key }) => key)).size !== 341) {
    throw new Error("resolved Storage object plan is incomplete or duplicated");
  }
  return objects;
}

async function fetchRemoteObject(
  object: StorageObjectPlan,
  cacheBust: string | null = null,
): Promise<Buffer | null> {
  const url = cacheBust
    ? `${object.url}?tuji-release=${object.contentSha256.slice(0, 20)}&probe=${encodeURIComponent(cacheBust)}`
    : object.url;
  const response = await fetch(url, {
    cache: "no-store",
    headers: cacheBust ? { "cache-control": "no-cache" } : undefined,
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${object.key}: remote HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchRemoteObjectFresh(object: StorageObjectPlan): Promise<Buffer | null> {
  // A newly created immutable path can still have an older CDN 404 cached at
  // the bare URL. Confirm the origin through a content-derived query before
  // deciding that the object is absent and attempting a create-only PUT.
  return (await fetchRemoteObject(object)) ?? (await fetchRemoteObject(object, "origin-check-v2"));
}

function assertRemoteBytes(object: StorageObjectPlan, bytes: Buffer) {
  if (bytes.length !== object.bytes || sha256(bytes) !== object.contentSha256) {
    throw new Error(`${object.key}: remote bytes differ from the immutable plan`);
  }
}

async function verifyAllRemoteObjects(objects: StorageObjectPlan[]) {
  for (let index = 0; index < objects.length; index += 20) {
    await Promise.all(objects.slice(index, index + 20).map(async (object) => {
      const bytes = await fetchRemoteObject(object, `final-${Date.now()}`);
      if (!bytes) throw new Error(`${object.key}: remote object is missing`);
      assertRemoteBytes(object, bytes);
    }));
  }
}

async function stageStorage(manifestFile: string, manifest: ApplyManifest) {
  manifest.status = "uploading";
  manifest.updatedAt = new Date().toISOString();
  writeJsonAtomic(manifestFile, manifest);
  for (const [index, object] of manifest.storageObjects.entries()) {
    if (object.verified) continue;
    const remote = await fetchRemoteObjectFresh(object);
    if (remote) {
      assertRemoteBytes(object, remote);
      object.existedBefore = true;
      if (object.uploadIntent) object.uploadedByRun = true;
    } else {
      if (!object.uploadRequired) throw new Error(`${object.key}: required reused object is missing`);
      const localBytes = fs.readFileSync(path.resolve(ROOT, object.localFile));
      object.uploadIntent = true;
      manifest.updatedAt = new Date().toISOString();
      writeJsonAtomic(manifestFile, manifest);
      const url = await putPublicObject(object.bucket, object.storagePath, localBytes, {
        contentType: object.bucket === "word-images" ? WORD_IMAGE_CONTENT_TYPE : object.mimeType,
        upsert: false,
        requireAbsent: true,
      });
      if (url !== object.url) throw new Error(`${object.key}: writer returned an unexpected URL`);
      object.uploadedByRun = true;
      const uploaded = await fetchRemoteObject(object, `post-upload-${Date.now()}`);
      if (!uploaded) throw new Error(`${object.key}: upload was not readable`);
      assertRemoteBytes(object, uploaded);
    }
    object.verified = true;
    manifest.updatedAt = new Date().toISOString();
    writeJsonAtomic(manifestFile, manifest);
    if ((index + 1) % 25 === 0 || index + 1 === manifest.storageObjects.length) {
      console.log(`[alcoholic-drinks:publish] Storage ${index + 1}/${manifest.storageObjects.length}`);
    }
  }
  manifest.status = "uploaded";
  manifest.updatedAt = new Date().toISOString();
  writeJsonAtomic(manifestFile, manifest);
}

async function deleteSentenceRows(tx: Tx, english: string[], japanese: string[]) {
  await tx`
    DELETE FROM sentence_span_glosses
    WHERE (sentence_language = 'en' AND sentence = ANY(${english}))
       OR (sentence_language = 'ja' AND sentence = ANY(${japanese}))
  `;
  await tx`
    DELETE FROM sentence_spans
    WHERE (sentence_language = 'en' AND sentence = ANY(${english}))
       OR (sentence_language = 'ja' AND sentence = ANY(${japanese}))
  `;
}

async function insertSpans(tx: Tx, plan: any) {
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
            ["zh-Hant", span.z], ["ja", span.j], ["en", span.e],
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

async function insertWordCore(tx: Tx, item: any, exampleIds: Record<string, string>) {
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
    INSERT INTO word_terms (word_id, language, term, reading, pronunciation, reading_segments)
    VALUES (
      ${word.id}, 'ja', ${word.ja}, ${word.jaReading}, ${word.jaReading},
      ${word.jaReadingSegments ? tx.json(word.jaReadingSegments) : null}
    )
  `;
  for (const example of item.examples) {
    const exampleId = exampleIds[example.ownerKey];
    await tx`
      INSERT INTO word_examples (id, word_id, sentence, cefr_level, sort_order)
      VALUES (${exampleId}, ${word.id}, ${example.en}, ${example.cefrLevel}, ${example.sortOrder})
    `;
    await tx`
      INSERT INTO word_example_translations (example_id, language, translation)
      VALUES (${exampleId}, 'ja', ${example.ja}), (${exampleId}, 'zh', ${example.zh})
    `;
  }
  for (const relatedId of word.relatedWords) {
    await tx`
      INSERT INTO word_relations (source_word_id, target_word_id, relation_type, note)
      VALUES (${word.id}, ${relatedId}, 'see-also', NULL)
    `;
  }
  await tx`
    INSERT INTO word_categories (word_id, category_id, is_primary)
    VALUES (${word.id}, ${word.category}, TRUE)
  `;
}

async function updateSakeCore(tx: Tx, item: any, plan: any, exampleIds: Record<string, string>) {
  const old = plan.databasePreflight.sakeBefore;
  const oldEnglish = old.examples.map((example: any) => example.sentence);
  const oldJapanese = old.translations
    .filter((translation: any) => translation.language === "ja")
    .map((translation: any) => translation.translation);
  await deleteSentenceRows(tx, oldEnglish, oldJapanese);
  await tx`DELETE FROM word_example_media WHERE example_id::text = ANY(${old.examples.map((example: any) => String(example.id))})`;
  await tx`DELETE FROM word_media WHERE word_id = ${EXISTING_ID}`;
  await tx`DELETE FROM word_definitions WHERE word_id = ${EXISTING_ID}`;
  await tx`DELETE FROM word_terms WHERE word_id = ${EXISTING_ID}`;
  await tx`DELETE FROM word_relations WHERE source_word_id = ${EXISTING_ID}`;
  await tx`DELETE FROM word_categories WHERE word_id = ${EXISTING_ID}`;
  await tx`DELETE FROM word_example_translations WHERE example_id::text = ANY(${old.examples.map((example: any) => String(example.id))})`;
  await tx`
    UPDATE words SET
      word = ${item.word.word}, category = ${item.word.category},
      part_of_speech = ${item.word.partOfSpeech}, pronunciation = ${item.word.pronunciation},
      image_url = ${item.image.url}, chinese_definition = ${item.word.chineseDefinition},
      status = 'published', updated_at = now()
    WHERE id = ${EXISTING_ID}
  `;
  for (const definition of item.word.definitions) {
    await tx`
      INSERT INTO word_definitions (word_id, language, definition, sort_order)
      VALUES (${EXISTING_ID}, ${definition.language}, ${definition.definition}, ${definition.sortOrder})
    `;
  }
  await tx`
    INSERT INTO word_terms (word_id, language, term, pronunciation)
    VALUES (${EXISTING_ID}, 'en', ${item.word.word}, ${item.word.pronunciation})
  `;
  await tx`
    INSERT INTO word_terms (word_id, language, term, reading, pronunciation, reading_segments)
    VALUES (
      ${EXISTING_ID}, 'ja', ${item.word.ja}, ${item.word.jaReading}, ${item.word.jaReading},
      ${item.word.jaReadingSegments ? tx.json(item.word.jaReadingSegments) : null}
    )
  `;
  for (const example of item.examples) {
    const exampleId = exampleIds[example.ownerKey];
    const updated = await tx<{ id: string }[]>`
      UPDATE word_examples SET
        sentence = ${example.en}, cefr_level = ${example.cefrLevel},
        sort_order = ${example.sortOrder}
      WHERE id = ${exampleId} AND word_id = ${EXISTING_ID}
      RETURNING id::text
    `;
    if (updated.length !== 1) throw new Error(`${example.ownerKey}: stable sake example ID disappeared`);
    await tx`
      INSERT INTO word_example_translations (example_id, language, translation)
      VALUES (${exampleId}, 'ja', ${example.ja}), (${exampleId}, 'zh', ${example.zh})
    `;
  }
  for (const relatedId of item.word.relatedWords) {
    await tx`
      INSERT INTO word_relations (source_word_id, target_word_id, relation_type, note)
      VALUES (${EXISTING_ID}, ${relatedId}, 'see-also', NULL)
    `;
  }
  await tx`
    INSERT INTO word_categories (word_id, category_id, is_primary)
    VALUES (${EXISTING_ID}, 'alcoholic-drinks', TRUE)
  `;
}

async function insertMediaAndCards(
  tx: Tx,
  plan: any,
  manifest: ApplyManifest,
  item: any,
  exampleIds: Record<string, string>,
) {
  const objectByKey = new Map(manifest.storageObjects.map((object) => [object.key, object]));
  const image = objectByKey.get(`${item.image.bucket}|${item.image.storagePath}`)!;
  await tx`
    INSERT INTO word_media (
      word_id, kind, url, storage_path, mime_type, width, height,
      license, credit, model, is_primary, sort_order, metadata
    ) VALUES (
      ${item.word.id}, 'image', ${image.url}, ${image.storagePath}, ${image.mimeType},
      ${item.image.width}, ${item.image.height}, ${item.image.license}, ${item.image.credit},
      ${item.image.mode === "reuse-existing" ? null : "imagegen"}, TRUE, 0,
      ${tx.json({ sha256: image.contentSha256, sourceFile: item.image.sourceFile })}
    )
  `;
  for (const audio of item.headwordAudio) {
    const object = objectByKey.get(`${audio.bucket}|${audio.storagePath}`)!;
    await tx`
      INSERT INTO word_media (word_id, kind, url, storage_path, mime_type, model, locale, metadata)
      VALUES (
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
      await tx`UPDATE words SET audio_url = ${object.url}, updated_at = now() WHERE id = ${item.word.id}`;
    } else if (audio.locale === "ja-JP") {
      await tx`
        UPDATE word_terms SET audio_url = ${object.url}, updated_at = now()
        WHERE word_id = ${item.word.id} AND language = 'ja'
      `;
    }
  }
  for (const example of item.examples) {
    const exampleId = exampleIds[example.ownerKey];
    for (const audio of example.audio) {
      const concretePath = audio.storagePath.replace("{exampleId}", exampleId);
      const object = objectByKey.get(`${audio.bucket}|${concretePath}`)!;
      await tx`
        INSERT INTO word_example_media (example_id, locale, url, storage_path, mime_type, model)
        VALUES (${exampleId}, ${audio.locale}, ${object.url}, ${object.storagePath}, ${object.mimeType}, ${audio.model})
      `;
    }
  }
  const englishCard = {
    card_type: "回想卡",
    front: "",
    back: item.word.word,
    explanation: `${item.word.word} ${item.word.pronunciation} — ${item.word.chinese}`,
    tags: [item.word.category, item.word.partOfSpeech, "看圖選英文"],
    deck_key: "image-en",
  };
  const japaneseCard = {
    card_type: "回想卡",
    front: "",
    back: item.word.ja,
    explanation: `${item.word.ja} ${item.word.jaReading}`,
    tags: ["image", "ja"],
    deck_key: "image-ja",
  };
  if (item.operation === "update-existing") {
    for (const card of [englishCard, japaneseCard]) {
      const updated = await tx<{ id: string }[]>`
        UPDATE cards SET card_type = ${card.card_type}, front = ${card.front}, back = ${card.back},
          explanation = ${card.explanation}, tags = ${card.tags}
        WHERE word_id = ${item.word.id} AND deck_key = ${card.deck_key}
        RETURNING id::text
      `;
      if (updated.length !== 1) throw new Error(`sake/${card.deck_key}: expected one stable card`);
    }
  } else {
    for (const card of [englishCard, japaneseCard]) {
      await tx`
        INSERT INTO cards (word_id, card_type, front, back, explanation, tags, deck_key)
        VALUES (
          ${item.word.id}, ${card.card_type}, ${card.front}, ${card.back},
          ${card.explanation}, ${card.tags}, ${card.deck_key}
        )
      `;
    }
  }
}

async function verifyAppliedContent(tx: Tx, plan: any, exampleIds: Record<string, string>) {
  const ids = plan.entries.map((item: any) => item.word.id);
  const { english, japanese } = sentenceSets(plan);
  const snapshot = await snapshotCatalog(tx, ids, english, japanese);
  if (
    snapshot.words.length !== 34 || snapshot.terms.length !== 68 ||
    snapshot.definitions.length !== 102 || snapshot.examples.length !== 68 ||
    snapshot.translations.length !== 136 || snapshot.categories.length !== 34 ||
    snapshot.media.length !== 136 || snapshot.exampleMedia.length !== 204 ||
    snapshot.cards.length !== 68
  ) {
    throw new Error("applied catalogue row counts are incomplete");
  }
  assertRowSet(
    "word identities",
    snapshot.words.map(({ id, word, category, status, image_url }) => ({ id, word, category, status, image_url })),
    plan.entries.map((item: any) => ({
      id: item.word.id,
      word: item.word.word,
      category: "alcoholic-drinks",
      status: "published",
      image_url: item.image.url,
    })),
  );
  assertRowSet(
    "definitions",
    snapshot.definitions,
    plan.entries.flatMap((item: any) => item.word.definitions.map((definition: any) => ({
      word_id: item.word.id,
      language: definition.language,
      definition: definition.definition,
      cefr_level: null,
      sort_order: definition.sortOrder,
    }))),
  );
  assertRowSet(
    "examples",
    snapshot.examples,
    plan.entries.flatMap((item: any) => item.examples.map((example: any) => ({
      id: exampleIds[example.ownerKey],
      word_id: item.word.id,
      sentence: example.en,
      cefr_level: example.cefrLevel,
      sort_order: example.sortOrder,
    }))),
  );
  assertRowSet(
    "translations",
    snapshot.translations,
    plan.entries.flatMap((item: any) => item.examples.flatMap((example: any) => [
      { example_id: exampleIds[example.ownerKey], language: "ja", translation: example.ja },
      { example_id: exampleIds[example.ownerKey], language: "zh", translation: example.zh },
    ])),
  );
  assertRowSet(
    "category links",
    snapshot.categories,
    ids.map((wordId: string) => ({ word_id: wordId, category_id: "alcoholic-drinks", is_primary: true })),
  );
  return snapshot;
}

async function applyRelease(tx: Tx, plan: any, manifest: ApplyManifest) {
  await tx.unsafe("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
  await tx.unsafe(`
    LOCK TABLE words, word_terms, word_definitions, word_examples,
      word_example_translations, sentence_spans, sentence_span_glosses,
      word_relations, word_categories, word_media, word_example_media,
      cards, categories, category_translations
    IN SHARE ROW EXCLUSIVE MODE
  `);
  const currentSake = await snapshotSake(tx);
  if (digest(currentSake) !== manifest.sakeBeforeDigest) {
    throw new Error("apply refused: the sake catalogue snapshot changed after review");
  }
  const newIds = plan.releaseShape.insertWordIds as string[];
  const conflicts = await tx<{ id: string }[]>`SELECT id FROM words WHERE id = ANY(${newIds}) FOR UPDATE`;
  if (conflicts.length > 0) throw new Error("apply refused: at least one new word ID now exists");
  const categoryConflict = await tx<{ id: string }[]>`
    SELECT id FROM categories WHERE id = ${plan.category.id} FOR UPDATE
  `;
  if (categoryConflict.length > 0) throw new Error("apply refused: category now exists");
  const category = expectedCategory(plan);
  await tx`
    INSERT INTO categories (
      id, name, name_zh, emoji, description, description_en, color, image_url, sort_order
    ) VALUES (
      ${category.id}, ${category.name}, ${category.name_zh}, ${category.emoji},
      ${category.description}, ${category.description_en}, ${category.color}, ${category.image_url},
      (SELECT COALESCE(max(sort_order), -1) + 1 FROM categories)
    )
  `;
  await tx`
    INSERT INTO category_translations (category_id, language, name, description)
    VALUES (${category.id}, 'ja', ${plan.category.nameJa}, ${plan.category.descriptionJa})
  `;
  for (const item of plan.entries.filter((candidate: any) => candidate.operation === "insert")) {
    await insertWordCore(tx, item, manifest.resolvedExampleIds);
  }
  const sake = plan.entries.find((item: any) => item.word.id === EXISTING_ID);
  await updateSakeCore(tx, sake, plan, manifest.resolvedExampleIds);
  await insertSpans(tx, plan);
  for (const item of plan.entries) {
    await insertMediaAndCards(tx, plan, manifest, item, manifest.resolvedExampleIds);
  }
  const published = await tx<{ id: string }[]>`
    UPDATE words SET status = 'published', updated_at = now()
    WHERE id = ANY(${newIds}) AND status = 'draft' RETURNING id
  `;
  if (published.length !== 33) throw new Error(`expected to publish 33 new words, changed ${published.length}`);
  await verifyAppliedContent(tx, plan, manifest.resolvedExampleIds);
}

async function countUserReferences(sql: Sql | Tx, ids: string[], categoryId: string) {
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
        WHERE study_category = ${categoryId}
           OR ${categoryId} = ANY(regexp_split_to_array(study_categories, '\\s*,\\s*'))
      ) AS user_settings
  `;
  return row;
}

async function restoreSake(tx: Tx, plan: any) {
  const old = plan.databasePreflight.sakeBefore;
  const word = old.words[0];
  const current = plan.entries.find((item: any) => item.word.id === EXISTING_ID);
  await deleteSentenceRows(
    tx,
    current.examples.map((example: any) => example.en),
    current.examples.map((example: any) => example.ja),
  );
  const exampleIds = old.examples.map((example: any) => String(example.id));
  await tx`DELETE FROM word_example_media WHERE example_id::text = ANY(${exampleIds})`;
  await tx`DELETE FROM word_media WHERE word_id = ${EXISTING_ID}`;
  await tx`DELETE FROM word_definitions WHERE word_id = ${EXISTING_ID}`;
  await tx`DELETE FROM word_terms WHERE word_id = ${EXISTING_ID}`;
  await tx`DELETE FROM word_relations WHERE source_word_id = ${EXISTING_ID}`;
  await tx`DELETE FROM word_categories WHERE word_id = ${EXISTING_ID}`;
  await tx`DELETE FROM word_example_translations WHERE example_id::text = ANY(${exampleIds})`;
  await tx`
    UPDATE words SET
      word = ${word.word}, also_known_as = ${word.also_known_as}, category = ${word.category},
      part_of_speech = ${word.part_of_speech}, pronunciation = ${word.pronunciation},
      image_url = ${word.image_url}, audio_url = ${word.audio_url}, cefr_level = ${word.cefr_level},
      status = ${word.status}, collocations = ${word.collocations}, note = ${word.note},
      chinese_definition = ${word.chinese_definition}, image_source_url = ${word.image_source_url},
      image_license = ${word.image_license}, image_credit = ${word.image_credit},
      etymology = ${word.etymology}, forms = ${word.forms}, deleted_at = ${word.deleted_at},
      updated_at = now()
    WHERE id = ${EXISTING_ID}
  `;
  for (const row of old.terms) {
    await tx`
      INSERT INTO word_terms (
        word_id, language, term, reading, pronunciation, reading_segments, audio_url
      ) VALUES (
        ${row.word_id}, ${row.language}, ${row.term}, ${row.reading}, ${row.pronunciation},
        ${row.reading_segments ? tx.json(row.reading_segments) : null}, ${row.audio_url}
      )
    `;
  }
  for (const row of old.definitions) {
    await tx`
      INSERT INTO word_definitions (word_id, language, definition, cefr_level, sort_order)
      VALUES (${row.word_id}, ${row.language}, ${row.definition}, ${row.cefr_level}, ${row.sort_order})
    `;
  }
  for (const row of old.examples) {
    await tx`
      UPDATE word_examples SET sentence = ${row.sentence}, cefr_level = ${row.cefr_level},
        sort_order = ${row.sort_order}
      WHERE id = ${row.id} AND word_id = ${EXISTING_ID}
    `;
  }
  for (const row of old.translations) {
    await tx`
      INSERT INTO word_example_translations (example_id, language, translation)
      VALUES (${row.example_id}, ${row.language}, ${row.translation})
    `;
  }
  for (const row of old.relations) {
    await tx`
      INSERT INTO word_relations (source_word_id, target_word_id, relation_type, note)
      VALUES (${row.source_word_id}, ${row.target_word_id}, ${row.relation_type}, ${row.note})
    `;
  }
  for (const row of old.categories) {
    await tx`
      INSERT INTO word_categories (word_id, category_id, is_primary)
      VALUES (${row.word_id}, ${row.category_id}, ${row.is_primary})
    `;
  }
  for (const row of old.spans) {
    await tx`
      INSERT INTO sentence_spans (
        sentence_language, sentence, sort_order, text, base_form,
        part_of_speech, reading, word_id, version
      ) VALUES (
        ${row.sentence_language}, ${row.sentence}, ${row.sort_order}, ${row.text}, ${row.base_form},
        ${row.part_of_speech}, ${row.reading}, ${row.word_id}, ${row.version}
      )
    `;
  }
  for (const row of old.glosses) {
    await tx`
      INSERT INTO sentence_span_glosses (
        sentence_language, sentence, sort_order, language, gloss
      ) VALUES (${row.sentence_language}, ${row.sentence}, ${row.sort_order}, ${row.language}, ${row.gloss})
    `;
  }
  for (const row of old.media) {
    await tx`
      INSERT INTO word_media (
        word_id, kind, url, storage_path, mime_type, width, height, duration_ms,
        source_url, license, credit, prompt, model, locale, is_primary, sort_order, metadata
      ) VALUES (
        ${row.word_id}, ${row.kind}, ${row.url}, ${row.storage_path}, ${row.mime_type},
        ${row.width}, ${row.height}, ${row.duration_ms}, ${row.source_url}, ${row.license},
        ${row.credit}, ${row.prompt}, ${row.model}, ${row.locale}, ${row.is_primary},
        ${row.sort_order}, ${tx.json(row.metadata ?? {})}
      )
    `;
  }
  for (const row of old.exampleMedia) {
    await tx`
      INSERT INTO word_example_media (example_id, locale, url, storage_path, mime_type, duration_ms, model)
      VALUES (
        ${row.example_id}, ${row.locale}, ${row.url}, ${row.storage_path},
        ${row.mime_type}, ${row.duration_ms}, ${row.model}
      )
    `;
  }
  for (const row of old.cards) {
    const updated = await tx<{ id: string }[]>`
      UPDATE cards SET card_type = ${row.card_type}, front = ${row.front}, back = ${row.back},
        explanation = ${row.explanation}, tags = ${row.tags}, deck_key = ${row.deck_key}
      WHERE id = ${row.id} AND word_id = ${EXISTING_ID} RETURNING id::text
    `;
    if (updated.length !== 1) throw new Error(`rollback refused: sake card ${row.id} changed identity`);
  }
}

async function rollback(sql: Sql, manifestFile: string, manifest: ApplyManifest, planFile: string, plan: any) {
  assertWriteConfirmation(manifest.databaseHostFingerprint, manifest.storageTargetFingerprint);
  if (manifest.storageBackend !== writeBackend() || manifest.storageTargetFingerprint !== currentStorageTargetFingerprint()) {
    throw new Error("rollback refused: Storage target differs from the apply manifest");
  }
  if (sha256(fs.readFileSync(planFile)) !== manifest.planSha256) {
    throw new Error("rollback refused: publish plan digest changed");
  }
  if (!manifest.sakeAfterDigest || !manifest.insertedSeriesAfterDigest) {
    throw new Error("rollback refused: apply manifest lacks post-apply digests");
  }
  manifest.status = "rolling-back";
  manifest.updatedAt = new Date().toISOString();
  writeJsonAtomic(manifestFile, manifest);
  const newIds = plan.releaseShape.insertWordIds as string[];
  const newEntries = plan.entries.filter((item: any) => item.operation === "insert");
  const newEnglish = newEntries.flatMap((item: any) => item.examples.map((example: any) => example.en));
  const newJapanese = newEntries.flatMap((item: any) => item.examples.map((example: any) => example.ja));
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
      await tx.unsafe(`
        LOCK TABLE words, word_terms, word_definitions, word_examples,
          word_example_translations, sentence_spans, sentence_span_glosses,
          word_relations, word_categories, word_media, word_example_media,
          cards, categories, category_translations, user_settings
        IN SHARE ROW EXCLUSIVE MODE
      `);
      const currentSake = await snapshotSake(tx);
      if (digest(currentSake) !== manifest.sakeAfterDigest) {
        throw new Error("rollback refused: sake changed after the release");
      }
      const currentNew = await snapshotCatalog(tx, newIds, newEnglish, newJapanese);
      if (digest(currentNew) !== manifest.insertedSeriesAfterDigest) {
        throw new Error("rollback refused: inserted series changed after the release");
      }
      const userReferences = await countUserReferences(tx, newIds, plan.category.id);
      const referenceCount = Object.values(userReferences).reduce((sum, value) => sum + Number(value), 0);
      if (referenceCount > 0 && !ALLOW_USER_DATA_LOSS) {
        throw new Error(`rollback refused: ${referenceCount} user-data references exist`);
      }
      await deleteSentenceRows(tx, newEnglish, newJapanese);
      await tx`DELETE FROM words WHERE id = ANY(${newIds})`;
      await restoreSake(tx, plan);
      await tx`DELETE FROM categories WHERE id = ${plan.category.id}`;
      const restoredSake = await snapshotSake(tx);
      if (digest(restoredSake) !== manifest.sakeBeforeDigest) {
        throw new Error("rollback verification failed: sake was not restored exactly");
      }
    });
    manifest.status = "rolled-back-storage-retained";
    manifest.rolledBackAt = new Date().toISOString();
    manifest.updatedAt = manifest.rolledBackAt;
    writeJsonAtomic(manifestFile, manifest);
    console.log("[alcoholic-drinks:publish] database rolled back; content-addressed Storage retained");
  } catch (error) {
    manifest.status = "rollback-failed";
    manifest.failure = error instanceof Error ? error.message : String(error);
    manifest.updatedAt = new Date().toISOString();
    writeJsonAtomic(manifestFile, manifest);
    throw error;
  }
}

async function main() {
  if (ROLLBACK_FILE && (APPLY || RESUME_FILE)) throw new Error("do not combine --rollback with --apply or --resume");
  if (RESUME_FILE && !APPLY) throw new Error("--resume requires --apply");
  const actionFile = ROLLBACK_FILE ?? RESUME_FILE;
  const actionManifestFile = actionFile ? path.resolve(ROOT, actionFile) : null;
  const actionManifest = actionManifestFile ? readJson<ApplyManifest>(actionManifestFile) : null;
  if (actionManifest && (actionManifest.schemaVersion !== 1 || actionManifest.series !== "alcoholic-drinks")) {
    throw new Error("invalid alcoholic-drinks recovery manifest");
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
  if (!ROLLBACK_FILE) assertWriterConfigured();
  const storageFingerprint = currentStorageTargetFingerprint();
  const sql = postgres(databaseUrl, { ssl: "require", prepare: false, max: 1 });
  try {
    if (ROLLBACK_FILE) {
      if (actionManifest!.databaseHostFingerprint !== hostFingerprint) {
        throw new Error("rollback manifest belongs to a different logical database");
      }
      await rollback(sql, actionManifestFile!, actionManifest!, planFile, plan);
      return;
    }
    const preflight = await inspectDatabase(sql, plan);
    console.log(JSON.stringify({
      mode: APPLY ? "apply" : "dry-run",
      databaseHostFingerprint: hostFingerprint,
      storageBackend: writeBackend(),
      storageTargetFingerprint: storageFingerprint,
      candidateRows: preflight.candidateRows.length,
      newRows: preflight.newRows.length,
      headwordConflicts: preflight.headwordConflicts.length,
      spanCollisions: preflight.spanCollisions.length,
      categoryExists: Boolean(preflight.category),
      sakeBeforeDigest: preflight.sakeBeforeDigest,
      sakeSnapshotSections:
        preflight.sakeBeforeDigest === plan.databasePreflight.sakeBeforeDigest
          ? "match"
          : Object.fromEntries(
              Object.keys(preflight.sake).map((key) => [key, {
                live: digest((preflight.sake as any)[key]),
                planned: digest(plan.databasePreflight.sakeBefore[key]),
              }]),
            ),
      writeReady: preflight.writeReady,
      alreadyApplied: preflight.alreadyApplied,
    }, null, 2));
    if (!preflight.writeReady) throw new Error("database preflight failed");
    if (!APPLY) {
      console.log(
        `[alcoholic-drinks:publish] dry run only; no Storage or database changes. ` +
        `A separately authorized apply must pass --apply --confirm-host ${hostFingerprint} ` +
        `--confirm-storage ${storageFingerprint}`,
      );
      return;
    }
    assertWriteConfirmation(hostFingerprint, storageFingerprint);
    if (preflight.alreadyApplied && !RESUME_FILE) {
      throw new Error("series is already published; use the audit workflow instead");
    }
    const manifestFile = actionManifestFile ?? path.join(
      path.dirname(planFile),
      `apply-manifest-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    );
    const manifest: ApplyManifest = actionManifest ?? {
      schemaVersion: 1,
      series: "alcoholic-drinks",
      status: "prepared",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      databaseHostFingerprint: hostFingerprint,
      storageBackend: writeBackend(),
      storageTargetFingerprint: storageFingerprint,
      planFile: relative(planFile),
      planSha256,
      resolvedExampleIds: {},
      storageObjects: [],
      sakeBeforeDigest: plan.databasePreflight.sakeBeforeDigest,
    };
    if (actionManifest) {
      if (
        manifest.databaseHostFingerprint !== hostFingerprint ||
        manifest.storageBackend !== writeBackend() ||
        manifest.storageTargetFingerprint !== storageFingerprint ||
        manifest.planSha256 !== planSha256
      ) {
        throw new Error("resume refused: database, Storage, or plan identity changed");
      }
      if (!["prepared", "ids-reserved", "uploading", "uploaded", "failed"].includes(manifest.status)) {
        throw new Error(`resume refused from manifest status ${manifest.status}`);
      }
    } else {
      writeJsonAtomic(manifestFile, manifest);
    }
    try {
      if (Object.keys(manifest.resolvedExampleIds).length === 0) {
        manifest.resolvedExampleIds = {
          ...resolveSakeExampleIds(plan),
          ...(await reserveNewExampleIds(sql, plan)),
        };
      }
      const expectedObjects = buildStorageObjects(plan, manifest.resolvedExampleIds);
      if (manifest.storageObjects.length === 0) {
        manifest.storageObjects = expectedObjects;
      } else {
        assertRowSet(
          "manifest Storage plan",
          manifest.storageObjects.map(({ existedBefore, uploadedByRun, uploadIntent, verified, ...object }) => object),
          expectedObjects.map(({ existedBefore, uploadedByRun, uploadIntent, verified, ...object }) => object),
        );
      }
      manifest.status = "ids-reserved";
      manifest.failure = undefined;
      manifest.updatedAt = new Date().toISOString();
      writeJsonAtomic(manifestFile, manifest);
      if (!preflight.alreadyApplied) {
        await stageStorage(manifestFile, manifest);
        await verifyAllRemoteObjects(manifest.storageObjects);
        await sql.begin((tx) => applyRelease(tx, plan, manifest));
      }
      const { english, japanese } = sentenceSets(plan);
      const after = await snapshotCatalog(
        sql,
        plan.entries.map((item: any) => item.word.id),
        english,
        japanese,
      );
      const afterSake = await snapshotSake(sql);
      const newEntries = plan.entries.filter((item: any) => item.operation === "insert");
      const afterNew = await snapshotCatalog(
        sql,
        plan.releaseShape.insertWordIds,
        newEntries.flatMap((item: any) => item.examples.map((example: any) => example.en)),
        newEntries.flatMap((item: any) => item.examples.map((example: any) => example.ja)),
      );
      if (after.words.length !== 34) throw new Error("post-apply verification found an incomplete series");
      manifest.sakeAfterDigest = digest(afterSake);
      manifest.insertedSeriesAfterDigest = digest(afterNew);
      manifest.status = "applied";
      manifest.appliedAt ??= new Date().toISOString();
      manifest.updatedAt = new Date().toISOString();
      writeJsonAtomic(manifestFile, manifest);
      console.log(`[alcoholic-drinks:publish] published 34-word series; manifest: ${relative(manifestFile)}`);
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
  console.error("[alcoholic-drinks:publish] failed:", error);
  process.exitCode = 1;
});
