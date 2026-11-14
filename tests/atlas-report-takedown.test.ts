// Pins the admin report queue's 下架 button. What 下架 and 撤出景點 do runs
// against real PostgreSQL in tests/atlas-publication-postgres.test.ts.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const atlasDb = readFileSync(new URL("../lib/atlas-db.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/admin/atlas/reports/page.tsx", import.meta.url), "utf8");

// An item reports auto-hid shows 'takedown' on its public copy while its own
// row is 'pending_review'. Reading the public copy would hide the button on
// exactly the reports a human most needs to decide.
test("the button keys on the author's row, not the public copy", () => {
  assert.match(atlasDb, /ui\.review_status AS item_review_status/);
  assert.match(atlasDb, /LEFT JOIN user_atlas_items ui ON ui\.id = r\.source_item_id/);
  const canTakeDown = page.slice(page.indexOf("function canTakeDown"), page.indexOf("function allowedStatus"));
  assert.match(canTakeDown, /item_review_status/);
  assert.doesNotMatch(canTakeDown, /public_review_status/);
});
