// Pins 檢舉頁直接下架 — the admin taking a reported item / 合集 down from the
// report queue instead of copying an Item ID over to 圖鑑審核.
//
// Source-reading, like atlas-withdraw.test.ts: the queries need a database to
// exercise, but the guarantees are properties of the code itself.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const atlasDb = readFileSync(new URL("../lib/atlas-db.ts", import.meta.url), "utf8");
const route = readFileSync(
  new URL("../app/api/admin/atlas/reports/[id]/route.ts", import.meta.url),
  "utf8",
);
const page = readFileSync(new URL("../app/admin/atlas/reports/page.tsx", import.meta.url), "utf8");

function fnBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

const takedown = fnBody(atlasDb, "takedownAtlasReportTarget");

// One implementation of "takedown" per target. A second copy here is how the
// report queue would end up hiding the public row but leaving the author's
// item re-submittable.
test("reuses the 圖鑑審核 takedowns rather than writing its own", () => {
  assert.match(takedown, /takedownAtlasPublicItem\(report\.source_item_id\)/);
  assert.match(takedown, /takedownAtlasCollection\(report\.target_id\)/);
  assert.doesNotMatch(takedown, /review_status = 'takedown'/);
});

// An author identity has no review state to flip (see
// maybeEscalateCollectionReport).
test("an author report is refused, not silently closed", () => {
  assert.match(takedown, /return "unsupported"/);
  assert.match(route, /result === "unsupported"[\s\S]*?status: 400/);
});

test("reports are closed only after the takedown succeeded", () => {
  const close = takedown.indexOf("SET status = 'reviewed'");
  assert.notEqual(close, -1);
  assert.ok(takedown.indexOf("takedownAtlasPublicItem(") < close);
  assert.ok(takedown.indexOf("takedownAtlasCollection(") < close);
});

// Closing by target, not by report id: otherwise each of five reports on the
// same card keeps offering the button. Dismissed ones stay dismissed.
test("closes every open report on the same target, and only open ones", () => {
  assert.match(
    takedown,
    /WHERE target_type = \$\{report\.target_type\}\s+AND target_id = \$\{report\.target_id\}::uuid\s+AND status = 'open'/,
  );
});

// After an auto-hide the public copy is already 'takedown' while the author's
// row is 'pending_review'. Reading the public copy would hide the button on
// exactly the reports a human most needs to decide.
test("the button keys on the author's row, not the public copy", () => {
  assert.match(atlasDb, /ui\.review_status AS item_review_status/);
  assert.match(atlasDb, /LEFT JOIN user_atlas_items ui ON ui\.id = r\.source_item_id/);
  const canTakeDown = page.slice(page.indexOf("function canTakeDown"), page.indexOf("function allowedStatus"));
  assert.match(canTakeDown, /item_review_status/);
  assert.doesNotMatch(canTakeDown, /public_review_status/);
});
