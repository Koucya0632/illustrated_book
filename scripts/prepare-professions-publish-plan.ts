// Prepare the reviewed professions series for a later guarded production apply.
//
// This command is intentionally read-only with respect to Storage and the
// application database. It normalizes the accepted PNGs into the exact WebP
// bytes we intend to upload, verifies every generated MP3 against its local
// manifest, and emits a self-contained owner/storage/database mapping plan.
// Pass --check-db to add a live SELECT-only preflight snapshot.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import sharp from "sharp";
import { encodeWordImage } from "../lib/word-image-encode";

const ROOT = process.cwd();
const BATCHES = ["a", "b", "c", "d", "e"] as const;
const AUDIO_BUCKET = "word-audio";
const IMAGE_BUCKET = "word-images";
const CHECK_DB = process.argv.includes("--check-db");

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

const OUTPUT_DIR = path.resolve(
  ROOT,
  argValue("--output-dir") ?? "output/professions-publish-prep",
);
const IMAGE_OUTPUT_DIR = path.join(OUTPUT_DIR, "images");
const PLAN_FILE = path.join(OUTPUT_DIR, "publish-plan.json");
const AUDIO_ROOT = path.join(ROOT, "output/professions-audio-candidates");
const AUDIO_MANIFEST_FILE = path.join(AUDIO_ROOT, "generated-manifest.json");
const VISUAL_AUDIT_FILE = path.join(
  ROOT,
  "output/imagegen/professions-2026-09-11-visual-audit/candidate-visual-review.json",
);

type Span = {
  t: string;
  z?: string;
  j?: string;
  e?: string;
  b?: string;
  p?: string;
  r?: string;
};

type Example = {
  en: string;
  ja: string;
  zh: string;
  cefrLevel: "A2" | "B1";
};

type Entry = {
  id: string;
  word: string;
  chinese: string;
  chineseDefinition: string;
  category: "professions";
  partOfSpeech: "noun";
  pronunciation: string;
  definitions: Array<{ language: string; definition: string; sortOrder: number }>;
  examples: [Example, Example];
  relatedWords: string[];
  ja: string;
  jaReading: string;
  jaReadingSegments: Array<{ text: string; ruby: string | null }> | null;
};

type BatchDocument = {
  schemaVersion: number;
  series: string;
  batch: string;
  state: string;
  entries: Entry[];
};

type SpanDocument = {
  schemaVersion: number;
  series: string;
  batch: string;
  en: Record<string, Span[]>;
  ja: Record<string, Span[]>;
};

type GeneratedAudio = {
  kind: "headword" | "example";
  ownerKey: string;
  wordId: string;
  slot?: number;
  locale: "en-US" | "en-GB" | "ja-JP";
  text: string;
  file: string;
  bytes: number;
  sha256: string;
  sourceText: string;
};

type AudioManifest = {
  schemaVersion: number;
  series: string;
  voice: string;
  generated: Record<string, GeneratedAudio>;
  failures: Record<string, string>;
  summary: { planned: number; present: number; failures: number };
};

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function relative(file: string): string {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function writeAtomic(file: string, value: Buffer | string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, value);
  fs.renameSync(temporary, file);
}

function audioKey(kind: "headword" | "example", ownerKey: string, locale: string) {
  return `${kind}|${ownerKey}|${locale}`;
}

function expectedAudioText(entry: Entry, kind: "headword" | "example", slot: number | null, locale: string) {
  if (kind === "headword") return locale === "ja-JP" ? entry.ja : entry.word;
  const example = entry.examples[slot!];
  return locale === "ja-JP" ? example.ja : example.en;
}

function verifyAudio(
  manifest: AudioManifest,
  entry: Entry,
  kind: "headword" | "example",
  slot: number | null,
  locale: "en-US" | "en-GB" | "ja-JP",
) {
  const ownerKey = kind === "headword" ? entry.id : `${entry.id}:${slot}`;
  const key = audioKey(kind, ownerKey, locale);
  const item = manifest.generated[key];
  if (!item) throw new Error(`${key}: generated audio is missing`);
  const expectedText = expectedAudioText(entry, kind, slot, locale);
  if (item.sourceText !== expectedText || item.text !== expectedText) {
    throw new Error(`${key}: source text does not match reviewed content`);
  }
  const localFile = path.join(AUDIO_ROOT, item.file);
  const bytes = fs.readFileSync(localFile);
  const contentSha256 = sha256(bytes);
  if (item.bytes !== bytes.length || item.sha256 !== contentSha256) {
    throw new Error(`${key}: local MP3 size or SHA-256 does not match its manifest`);
  }
  const storageSuffix = `${locale}/${contentSha256.slice(0, 20)}.mp3`;
  return {
    kind,
    table: kind === "headword" ? "word_media" : "word_example_media",
    ownerKey,
    wordId: entry.id,
    ...(slot === null ? {} : { slot, sortOrder: slot }),
    locale,
    conflictKey:
      kind === "headword"
        ? { wordId: entry.id, kind: "audio", locale }
        : { exampleOwnerKey: ownerKey, exampleId: "{resolve-after-insert}", locale },
    sourceText: expectedText,
    sourceLanguage: locale === "ja-JP" ? "ja" : "en",
    sourceDigest: sha256(`${locale}\u0000${expectedText}`),
    localFile: relative(localFile),
    bytes: bytes.length,
    contentSha256,
    mimeType: "audio/mpeg",
    model: "chirp-3-hd",
    voice: `${locale}-Chirp3-HD-${manifest.voice}`,
    bucket: AUDIO_BUCKET,
    storagePath:
      kind === "headword"
        ? `${entry.id}/${storageSuffix}`
        : `examples/{exampleId}/${storageSuffix}`,
  };
}

async function databasePreflight(entries: Entry[]) {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("--check-db requires DATABASE_URL");
  const parsed = new URL(databaseUrl);
  const sql = postgres(databaseUrl, { ssl: "require", prepare: false, max: 1 });
  try {
    const ids = entries.map(({ id }) => id);
    const lowerWords = entries.map(({ word }) => word.toLowerCase());
    const [identity] = await sql<{ database_name: string; user_name: string }[]>`
      SELECT current_database() AS database_name, current_user AS user_name
    `;
    const [tables] = await sql<Record<string, string | null>[]>`
      SELECT
        to_regclass('public.words')::text AS words,
        to_regclass('public.word_terms')::text AS word_terms,
        to_regclass('public.word_definitions')::text AS word_definitions,
        to_regclass('public.word_examples')::text AS word_examples,
        to_regclass('public.word_example_translations')::text AS word_example_translations,
        to_regclass('public.sentence_spans')::text AS sentence_spans,
        to_regclass('public.sentence_span_glosses')::text AS sentence_span_glosses,
        to_regclass('public.word_media')::text AS word_media,
        to_regclass('public.word_example_media')::text AS word_example_media
    `;
    const category = await sql<Record<string, unknown>[]>`
      SELECT id, name, name_zh, emoji, description, description_en, color, image_url, sort_order
      FROM categories WHERE id = 'professions'
    `;
    const idConflicts = await sql<{ id: string; word: string; status: string }[]>`
      SELECT id, word, status FROM words WHERE id = ANY(${ids}) ORDER BY id
    `;
    const textConflicts = await sql<{ id: string; word: string; status: string }[]>`
      SELECT id, word, status
      FROM words
      WHERE lower(word) = ANY(${lowerWords}) AND NOT (id = ANY(${ids}))
      ORDER BY id
    `;
    return {
      checkedAt: new Date().toISOString(),
      databaseName: identity.database_name,
      databaseUser: identity.user_name,
      databaseHostFingerprint: sha256(parsed.hostname).slice(0, 12),
      tables,
      existingCategory: category[0] ?? null,
      candidateIdConflicts: idConflicts,
      englishHeadwordConflicts: textConflicts,
      readyForGuardedInsert:
        Object.values(tables).every(Boolean) &&
        idConflicts.length === 0 &&
        textConflicts.length === 0,
    };
  } finally {
    await sql.end();
  }
}

async function main() {
  const batchDocs = new Map<string, BatchDocument>();
  const spanDocs = new Map<string, SpanDocument>();
  const sourceFiles: Array<{ file: string; sha256: string }> = [];
  for (const batch of BATCHES) {
    const entriesFile = path.join(ROOT, `data/professions-series-2026-09-batch-${batch}.json`);
    const spansFile = path.join(ROOT, `data/example-spans-professions-2026-09-batch-${batch}.json`);
    batchDocs.set(batch, readJson<BatchDocument>(entriesFile));
    spanDocs.set(batch, readJson<SpanDocument>(spansFile));
    for (const file of [entriesFile, spansFile]) {
      sourceFiles.push({ file: relative(file), sha256: sha256(fs.readFileSync(file)) });
    }
  }

  const entries = BATCHES.flatMap((batch) => batchDocs.get(batch)!.entries);
  const entryBatch = new Map(
    BATCHES.flatMap((batch) => batchDocs.get(batch)!.entries.map((entry) => [entry.id, batch] as const)),
  );
  const visualAudit = readJson<{
    summary: { total: number; pass: number; fail: number; needsConfirmation: number };
    items: Record<string, string>;
  }>(VISUAL_AUDIT_FILE);
  const audioManifest = readJson<AudioManifest>(AUDIO_MANIFEST_FILE);

  if (entries.length !== 100 || new Set(entries.map(({ id }) => id)).size !== 100) {
    throw new Error("expected exactly 100 unique profession entries");
  }
  if (
    visualAudit.summary.total !== 100 ||
    visualAudit.summary.pass !== 100 ||
    visualAudit.summary.fail !== 0 ||
    visualAudit.summary.needsConfirmation !== 0
  ) {
    throw new Error("the profession visual audit is not a clean 100/100 pass");
  }
  if (
    audioManifest.summary.planned !== 900 ||
    audioManifest.summary.present !== 900 ||
    audioManifest.summary.failures !== 0 ||
    Object.keys(audioManifest.failures ?? {}).length !== 0
  ) {
    throw new Error("the profession audio manifest is not a clean 900/900 result");
  }

  fs.mkdirSync(IMAGE_OUTPUT_DIR, { recursive: true });
  const mappedEntries = [];
  const allAudio = [];
  for (const entry of entries) {
    if (visualAudit.items[entry.id] !== "pass") {
      throw new Error(`${entry.id}: image was not accepted by the visual audit`);
    }
    const batch = entryBatch.get(entry.id)!;
    const imageSource = path.join(
      ROOT,
      `output/imagegen/professions-2026-09-11-batch-${batch}/originals/${entry.id}.png`,
    );
    const sourceBytes = fs.readFileSync(imageSource);
    const webpBytes = await encodeWordImage(sourceBytes);
    const metadata = await sharp(webpBytes, { failOn: "error" }).metadata();
    if (metadata.format !== "webp" || metadata.width !== 1200 || metadata.height !== 1200) {
      throw new Error(`${entry.id}: normalized image is not a 1200 x 1200 WebP`);
    }
    const imageSha256 = sha256(webpBytes);
    const imageOutput = path.join(IMAGE_OUTPUT_DIR, `${entry.id}-v2.webp`);
    writeAtomic(imageOutput, webpBytes);
    const imageStoragePath = `${entry.id}-ai-${imageSha256.slice(0, 12)}.webp`;

    const spanDoc = spanDocs.get(batch)!;
    const examples = entry.examples.map((example, sortOrder) => {
      const enSpans = spanDoc.en[example.en];
      const jaSpans = spanDoc.ja[example.ja];
      if (!enSpans || enSpans.map(({ t }) => t).join("") !== example.en) {
        throw new Error(`${entry.id}:${sortOrder}: English spans are missing or stale`);
      }
      if (!jaSpans || jaSpans.map(({ t }) => t).join("") !== example.ja) {
        throw new Error(`${entry.id}:${sortOrder}: Japanese spans are missing or stale`);
      }
      const audios = (["en-US", "en-GB", "ja-JP"] as const).map((locale) =>
        verifyAudio(audioManifest, entry, "example", sortOrder, locale),
      );
      allAudio.push(...audios);
      return {
        ownerKey: `${entry.id}:${sortOrder}`,
        resolveExampleIdBy: {
          wordId: entry.id,
          sortOrder,
          englishSentence: example.en,
          japaneseTranslation: example.ja,
        },
        sortOrder,
        ...example,
        spans: { en: enSpans, ja: jaSpans },
        audio: audios,
      };
    });
    const headwordAudio = (["en-US", "en-GB", "ja-JP"] as const).map((locale) =>
      verifyAudio(audioManifest, entry, "headword", null, locale),
    );
    allAudio.push(...headwordAudio);

    mappedEntries.push({
      contentDigest: sha256(JSON.stringify(entry)),
      word: entry,
      image: {
        sourceFile: relative(imageSource),
        sourceSha256: sha256(sourceBytes),
        localFile: relative(imageOutput),
        contentSha256: imageSha256,
        bytes: webpBytes.length,
        width: metadata.width,
        height: metadata.height,
        mimeType: "image/webp",
        bucket: IMAGE_BUCKET,
        storagePath: imageStoragePath,
        license: "ai-generated",
        credit: "OpenAI ImageGen",
      },
      headwordAudio,
      examples,
    });
  }

  if (allAudio.length !== 900) throw new Error(`expected 900 mapped audio clips, found ${allAudio.length}`);
  const audioConflictKeys = allAudio.map((item) => JSON.stringify(item.conflictKey));
  if (new Set(audioConflictKeys).size !== audioConflictKeys.length) {
    throw new Error("audio conflict keys are not unique");
  }

  const db = CHECK_DB ? await databasePreflight(entries) : null;
  const plan = {
    schemaVersion: 1,
    series: "professions",
    status: db && !db.readyForGuardedInsert ? "prepared-with-preflight-conflicts" : "prepared",
    productionWriteAllowed: false,
    createdAt: new Date().toISOString(),
    note:
      "This is a SELECT-only/local-artifact plan. A separate guarded apply must resolve every numeric exampleId after insertion and journal old/new Storage and DB state before production writes are allowed.",
    category: {
      id: "professions",
      name: "Professions",
      nameZh: "職業",
      nameJa: "職業",
      emoji: "🧑‍💼",
      description: "認識日常生活中的各種職業",
      descriptionEn: "People and jobs in everyday life",
      descriptionJa: "日常生活を支えるさまざまな仕事",
      color: "from-blue-100 to-amber-100",
      imageUrl:
        "https://img.nexflow.team/word-images/category-professions-ai-053af0e16e663a26.webp",
      reviewRequired: false,
    },
    sourceFiles: [
      ...sourceFiles,
      { file: relative(VISUAL_AUDIT_FILE), sha256: sha256(fs.readFileSync(VISUAL_AUDIT_FILE)) },
      { file: relative(AUDIO_MANIFEST_FILE), sha256: sha256(fs.readFileSync(AUDIO_MANIFEST_FILE)) },
    ],
    databasePreflight: db,
    summary: {
      words: mappedEntries.length,
      definitions: mappedEntries.reduce((n, item) => n + item.word.definitions.length, 0),
      examples: mappedEntries.reduce((n, item) => n + item.examples.length, 0),
      spanSentences: mappedEntries.reduce((n, item) => n + item.examples.length * 2, 0),
      images: mappedEntries.length,
      audioClips: allAudio.length,
      headwordAudioClips: allAudio.filter(({ kind }) => kind === "headword").length,
      exampleAudioClips: allAudio.filter(({ kind }) => kind === "example").length,
    },
    applyOrder: [
      "preflight exact candidate IDs, English terms, category and source digests",
      "stage content-addressed image and audio objects while journaling whether each object already existed",
      "insert category and all 100 words plus child rows in one database transaction",
      "resolve each numeric exampleId by wordId + sortOrder + exact English/Japanese source text",
      "insert word_media and word_example_media rows with compare-and-swap guards",
      "verify API rows, three locales per owner, HTTP bytes and content SHA-256",
    ],
    rollbackContract: {
      database:
        "Use the applied manifest's complete old/new row snapshots. Restore or delete only when the live row still equals the journaled new row; abort the whole transaction on any mismatch.",
      examples:
        "Before touching word_example_media, prove exampleId still belongs to the same wordId, sortOrder, English sentence and Japanese translation.",
      legacyMirrors:
        "Restore words.audio_url and word_terms.audio_url only when the current URL equals the journaled new URL.",
      storage:
        "Delete only objects created by this apply, only after database rollback succeeds, and only after checking that no database row still references the path or URL.",
      requiredAppliedManifestFields: [
        "resolved exampleId for every example ownerKey",
        "old and new database row snapshots",
        "old and new legacy audio URL values",
        "storage backend, path, URL, pre-existing flag, size and hash",
        "per-item apply and verification status",
      ],
    },
    entries: mappedEntries,
  };

  writeAtomic(PLAN_FILE, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        output: relative(PLAN_FILE),
        imageDirectory: relative(IMAGE_OUTPUT_DIR),
        status: plan.status,
        productionWriteAllowed: plan.productionWriteAllowed,
        ...plan.summary,
        databasePreflight: db
          ? {
              readyForGuardedInsert: db.readyForGuardedInsert,
              candidateIdConflicts: db.candidateIdConflicts.length,
              englishHeadwordConflicts: db.englishHeadwordConflicts.length,
              categoryAlreadyExists: Boolean(db.existingCategory),
            }
          : "not requested",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[prepare-professions-publish-plan] failed:", error);
  process.exitCode = 1;
});
