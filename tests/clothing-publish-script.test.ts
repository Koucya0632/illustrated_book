import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publisher = readFileSync(new URL("../scripts/publish-clothing-series.ts", import.meta.url), "utf8");
const preparer = readFileSync(new URL("../scripts/prepare-clothing-publish-plan.mjs", import.meta.url), "utf8");

test("clothing publisher defaults to a SELECT-only preflight and requires both target confirmations", () => {
  assert.match(publisher, /const APPLY = process\.argv\.includes\("--apply"\)/);
  assert.match(publisher, /if \(!APPLY\) \{[\s\S]*dry run only; no Storage or database changes[\s\S]*return;/);
  assert.match(publisher, /CONFIRMED_HOST !== hostFingerprint/);
  assert.match(publisher, /CONFIRMED_STORAGE !== storageTargetFingerprint/);
  assert.match(publisher, /plan\.databasePreflight\?\.databaseHostFingerprint !== hostFingerprint/);
  assert.match(publisher, /plan\.storageTarget\?\.fingerprint !== storageTargetFingerprint/);
});

test("the reviewed plan binds source and media bytes, including the category cover", () => {
  assert.match(publisher, /planDigest !== sha256\(JSON\.stringify\(canonical\(content\)\)\)/);
  assert.match(publisher, /reviewed source changed after planning/);
  assert.match(publisher, /category image bytes no longer match the plan/);
  assert.match(publisher, /const categoryImage = plan\.category\.image;[\s\S]*objects\.push/);
  assert.match(preparer, /semantic review is missing or stale|word review is missing or stale/);
  assert.match(preparer, /word review source digest is stale/);
  assert.match(preparer, /example review source digest is stale/);
  assert.match(preparer, /visual review does not match selected image/);
});

test("Storage is create-only and fully verified before one database publication transaction", () => {
  assert.match(publisher, /upsert: false,[\s\S]*requireAbsent: true/);
  assert.match(publisher, /const bytes = Buffer\.from\(await response\.arrayBuffer\(\)\)/);
  assert.match(publisher, /bytes\.length !== object\.bytes \|\| sha256\(bytes\) !== object\.contentSha256/);
  const stage = publisher.indexOf("await stageStorage(manifestFile, manifest)");
  const verify = publisher.indexOf("await verifyAllRemoteObjects(manifest.storageObjects)", stage);
  const insert = publisher.indexOf("await sql.begin(async (tx) => {\n        await insertDraftContent", verify);
  assert.ok(stage > 0 && stage < verify && verify < insert);
  assert.match(publisher, /await insertDraftContent\(tx, plan, manifest\.resolvedExampleIds\);\s*await publishDraft\(tx, plan, manifest\);/);
});

test("example audio waits for reserved Postgres IDs and interrupted runs retain their manifest", () => {
  assert.match(publisher, /reserveExampleIds\(sql, plan\)/);
  assert.match(publisher, /audio\.storagePath\.replace\("\{exampleId\}", exampleId\)/);
  assert.match(publisher, /manifest\.planSha256 !== planSha256/);
  assert.match(publisher, /manifest\.storageTargetFingerprint !== currentStorageTargetFingerprint\(\)/);
  assert.match(publisher, /recovery manifest: \$\{relative\(manifestFile\)\}/);
  assert.match(publisher, /rolled-back-storage-retained/);
});

test("intra-series relations are inserted after every new word exists", () => {
  const insert = publisher.slice(publisher.indexOf("async function insertDraftContent"), publisher.indexOf("async function reserveExampleIds"));
  const wordInsert = insert.indexOf("INSERT INTO words (");
  const afterAllWords = insert.indexOf("// All candidate related words belong to this new series");
  const relationInsert = insert.indexOf("INSERT INTO word_relations");
  assert.ok(wordInsert > 0 && wordInsert < afterAllWords && afterAllWords < relationInsert);
  assert.match(insert, /for \(const item of plan\.entries\) \{\s*for \(const relatedId of item\.word\.relatedWords\)/);
});
