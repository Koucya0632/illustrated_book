import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../scripts/publish-professions-series.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../scripts/migrate.ts", import.meta.url),
  "utf8",
);
const publicWriter = readFileSync(
  new URL("../lib/storage/public-writer.ts", import.meta.url),
  "utf8",
);
const mainWordMerges = readFileSync(
  new URL("../lib/main-word-merges.ts", import.meta.url),
  "utf8",
);
const publicData = readFileSync(
  new URL("../lib/data.ts", import.meta.url),
  "utf8",
);
const categoriesDb = readFileSync(
  new URL("../lib/categories-db.ts", import.meta.url),
  "utf8",
);
const wordsSource = readFileSync(
  new URL("../lib/words.ts", import.meta.url),
  "utf8",
);
const categoriesSource = readFileSync(
  new URL("../lib/categories.ts", import.meta.url),
  "utf8",
);

test("the professions publisher is a read-only dry run unless all write gates are explicit", () => {
  assert.match(source, /const APPLY = process\.argv\.includes\("--apply"\)/);
  assert.match(source, /if \(!APPLY\) \{[\s\S]*dry run only; no Storage or database changes[\s\S]*return;/);
  assert.match(source, /assertWriteConfirmation\(hostFingerprint, storageTargetFingerprint\)/);
  assert.match(source, /CONFIRMED_HOST !== hostFingerprint/);
  assert.match(source, /CONFIRMED_STORAGE !== storageTargetFingerprint/);
  assert.match(source, /assertWriterConfigured\(\)/);

  const dryRunExit = source.indexOf("if (!APPLY)");
  const writeConfirmation = source.lastIndexOf(
    "assertWriteConfirmation(hostFingerprint, storageTargetFingerprint)",
  );
  const firstDraftWrite = source.indexOf("insertDraftContent(tx, plan,", writeConfirmation);
  assert.ok(dryRunExit > 0 && dryRunExit < writeConfirmation);
  assert.ok(writeConfirmation < firstDraftWrite);
});

test("public fallbacks cannot expose the guarded series before database publication", () => {
  assert.match(
    wordsSource,
    /export const publicFallbackWords:[\s\S]*!\["professions", "alcoholic-drinks"\]\.includes\(word\.category\)/,
  );
  assert.match(publicData, /import \{ publicFallbackWords as staticWords \} from "\.\/words"/);
  assert.match(categoriesSource, /export const publicFallbackCategories:[\s\S]*category\.id !== "professions"/);
  assert.match(categoriesSource, /export const publicFallbackCategories:[\s\S]*category\.id !== "alcoholic-drinks"/);
  assert.match(
    categoriesDb,
    /import \{ publicFallbackCategories as staticCategories \} from "\.\/categories"/,
  );
});

test("publication stages Storage first, then inserts and publishes inside one transaction", () => {
  const insertDraft = source.indexOf("insertDraftContent(tx, plan,", source.indexOf("async function main"));
  const stageStorage = source.indexOf("await stageStorage(manifestFile, manifest)");
  const finalStorageVerification = source.indexOf(
    "await verifyAllRemoteObjects(manifest.storageObjects)",
    stageStorage,
  );
  const publishDraft = source.indexOf("publishDraft(tx, plan, manifest)", stageStorage);
  assert.ok(
    stageStorage > 0 &&
      stageStorage < finalStorageVerification &&
      finalStorageVerification < insertDraft &&
      finalStorageVerification < publishDraft,
  );
  assert.match(source, /await sql\.begin\(async \(tx\) => \{\s*await insertDraftContent[\s\S]*await publishDraft/);
  assert.match(source, /\$\{imageUrl\}, 'draft'/);
  assert.match(source, /await assertStoredContentMatchesPlan\(tx, plan, resolved, manifest, "draft"\)/);
  assert.match(source, /await assertStoredContentMatchesPlan\(tx, plan, resolved, manifest, "published"\)/);
  assert.match(source, /all 100 profession rows must still be draft/);
  assert.match(source, /UPDATE words SET status = 'published'/);
  assert.match(source, /expected to publish 100 rows/);
  assert.match(source, /object\.bucket === "word-images" \? WORD_IMAGE_CONTENT_TYPE/);
  assert.match(source, /requireAbsent: true/);
});

test("rollback uses full compare-and-swap checks and protects every user linkage", () => {
  assert.match(source, /rollback refused: live example identity differs/);
  for (const protectedContent of [
    "word rows",
    "definitions",
    "headword terms",
    "sentence spans",
    "word media",
    "example media",
    "cards",
  ]) {
    assert.match(source, new RegExp(`assertRowSet\\("${protectedContent}"`));
  }
  assert.match(source, /rollback refused: a profession sentence is now reused outside the series/);
  assert.match(source, /reused by an outside definition/);
  assert.match(source, /outside words now link to the profession series/);
  assert.match(source, /outside sentence spans now link to the profession series/);
  assert.match(source, /LOCK TABLE word_relations, sentence_spans, word_definitions/);
  assert.match(source, /userReferenceCount > 0 && !ALLOW_USER_DATA_LOSS/);
  for (const userTable of [
    "user_cards",
    "user_favorites",
    "user_learned",
    "user_words",
    "study_logs",
    "study_reports",
    "user_atlas_items",
    "user_settings",
  ]) {
    assert.match(source, new RegExp(userTable));
  }

  const contentCheck = source.indexOf("await assertStoredContentMatchesPlan", source.indexOf("async function rollback"));
  const databaseDelete = source.indexOf("DELETE FROM words", contentCheck);
  assert.ok(contentCheck > 0 && contentCheck < databaseDelete);
});

test("interrupted applies reuse one journal and rollback remains retryable", () => {
  assert.match(source, /--resume requires --apply/);
  assert.match(source, /if \(!value \|\| value\.startsWith\("--"\)\) throw new Error/);
  assert.match(source, /invalid professions recovery manifest/);
  assert.match(source, /committed profession drafts are from an obsolete publisher flow/);
  assert.match(source, /manifest\.storageBackend !== writeBackend\(\)/);
  assert.match(source, /manifest\.storageTargetFingerprint !== currentStorageTargetFingerprint\(\)/);
  assert.match(source, /object\.uploadIntent = true;[\s\S]*writeJsonAtomic\(manifestFile, manifest\);[\s\S]*putPublicObject/);
  assert.match(source, /"rolling-back",[\s\S]*"rollback-failed"/);
  assert.match(source, /manifest\.status = "rollback-failed"/);
  assert.match(source, /rolled-back-storage-retained/);
  assert.match(source, /recovered completed publication/);
  assert.doesNotMatch(source, /removePublicObjects/);
});

test("routine deploys defer the guarded series and touch only published catalogue rows", () => {
  assert.match(migration, /GUARDED_PUBLISH_WORD_IDS\.has\(word\.id\)/);
  assert.match(migration, /GUARDED_PUBLISH_SERIES\.some/);
  assert.match(migration, /ids\.every\(\(id\) => guardedPublishedKeys\.has/);
  assert.match(migration, /deferring \$\{guardedMissing\.length\} guarded series word/);
  assert.match(migration, /publishedWordIds\.delete\(id\)/);
  assert.match(migration, /if \(!publishedIds\.has\(w\.id\)\) continue/);
  assert.match(migration, /SELECT id FROM words WHERE status = 'published' AND deleted_at IS NULL/);
  assert.match(migration, /applyMainWordExamplePairs\([\s\S]*publishedWordIds/);
  assert.match(migration, /applyMainWordCorrections\(sql, publishedWordIds\)/);
  assert.match(mainWordMerges, /WHERE id = \$\{entry\.sourceId\}\s+AND status = 'published'/);
  assert.match(migration, /async function backfillSchemaV2[\s\S]*status = 'published'/);
  assert.match(migration, /async function backfillSchemaV3[\s\S]*w\.status = 'published'/);
  assert.match(
    migration,
    /INSERT INTO word_terms \(word_id, language, term, pronunciation\)[\s\S]*WHERE status = 'published' AND deleted_at IS NULL/,
  );
});

test("R2 publication is an atomic create-only write, never a list-then-overwrite", () => {
  assert.match(source, /requireAbsent: true/);
  assert.match(publicWriter, /IfNoneMatch: options\.requireAbsent \? "\*" : undefined/);
  assert.match(publicWriter, /R2 REST transport cannot provide an atomic create-only upload/);
  assert.match(publicWriter, /upsert: options\.requireAbsent \? false/);
});
