import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publisher = readFileSync(
  new URL("../scripts/publish-alcoholic-drinks-series.ts", import.meta.url),
  "utf8",
);
const preparer = readFileSync(
  new URL("../scripts/prepare-alcoholic-drinks-publish-plan.ts", import.meta.url),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { scripts: Record<string, string> };

test("the alcoholic-drinks publisher defaults to a SELECT-only dry run", () => {
  assert.match(publisher, /const APPLY = process\.argv\.includes\("--apply"\)/);
  assert.match(publisher, /if \(!APPLY\) \{/);
  assert.match(publisher, /dry run only; no Storage or database changes/);
  assert.match(packageJson.scripts["alcoholic-drinks:publish"], /publish-alcoholic-drinks-series\.ts/);
});

test("production writes require fresh database and physical Storage fingerprints", () => {
  const confirmation = publisher.indexOf("assertWriteConfirmation(hostFingerprint, storageFingerprint)");
  const reserve = publisher.indexOf("reserveNewExampleIds(sql, plan)", confirmation);
  const stage = publisher.indexOf("stageStorage(manifestFile, manifest)", confirmation);
  assert.ok(confirmation > 0);
  assert.ok(reserve > confirmation);
  assert.ok(stage > reserve);
  assert.match(publisher, /write refused: pass --confirm-host/);
  assert.match(publisher, /write refused: pass --confirm-storage/);
});

test("the immutable plan locks all reviewed inputs and local artifact bytes", () => {
  assert.match(preparer, /productionWriteAllowed: false/);
  assert.match(preparer, /sourceFiles/);
  assert.match(publisher, /source digest changed/);
  assert.match(publisher, /local bytes no longer match the plan/);
  assert.match(publisher, /expected 341 artifacts/);
});

test("Storage is staged and byte-verified before the serializable database transaction", () => {
  const stage = publisher.indexOf("await stageStorage(manifestFile, manifest)");
  const verify = publisher.indexOf("await verifyAllRemoteObjects(manifest.storageObjects)", stage);
  const transaction = publisher.indexOf("await sql.begin((tx) => applyRelease", verify);
  assert.ok(stage > 0 && verify > stage && transaction > verify);
  assert.match(publisher, /requireAbsent: true/);
  assert.match(publisher, /remote bytes differ from the immutable plan/);
  assert.match(publisher, /fetchRemoteObjectFresh/);
  assert.match(publisher, /tuji-release=/);
});

test("sake is compare-and-swap updated without changing word, example, or card IDs", () => {
  assert.match(publisher, /the sake catalogue snapshot changed after review/);
  assert.match(publisher, /UPDATE word_examples SET[\s\S]*WHERE id = \$\{exampleId\} AND word_id = \$\{EXISTING_ID\}/);
  assert.match(publisher, /UPDATE cards SET[\s\S]*WHERE word_id = \$\{item\.word\.id\} AND deck_key = \$\{card\.deck_key\}/);
  assert.doesNotMatch(publisher, /DELETE FROM words WHERE id = \$\{EXISTING_ID\}/);
});

test("the release publishes 33 drafts only after all 34 records and media rows are assembled", () => {
  const insert = publisher.indexOf("insertWordCore(tx, item, manifest.resolvedExampleIds)");
  const sake = publisher.indexOf("updateSakeCore(tx, sake, plan, manifest.resolvedExampleIds)");
  const media = publisher.indexOf("insertMediaAndCards(tx, plan, manifest, item");
  const publish = publisher.indexOf("UPDATE words SET status = 'published'", media);
  const verify = publisher.indexOf("verifyAppliedContent(tx, plan", publish);
  assert.ok(insert > 0 && sake > insert && media > sake && publish > media && verify > publish);
  assert.match(publisher, /expected to publish 33 new words/);
});

test("rollback is CAS guarded and preserves content-addressed Storage", () => {
  assert.match(publisher, /rollback refused: sake changed after the release/);
  assert.match(publisher, /rollback refused: inserted series changed after the release/);
  assert.match(publisher, /rollback refused: \$\{referenceCount\} user-data references exist/);
  assert.match(publisher, /restoreSake\(tx, plan\)/);
  assert.match(publisher, /rolled-back-storage-retained/);
  assert.doesNotMatch(publisher, /removePublicObjects/);
});

test("the plan records the mixed release shape and exact rollback source", () => {
  assert.match(preparer, /insertWordIds:/);
  assert.match(preparer, /updateWordIds: \[EXISTING_ID\]/);
  assert.match(preparer, /sakeBeforeDigest/);
  assert.match(preparer, /Preserve existing sake card IDs/);
});
