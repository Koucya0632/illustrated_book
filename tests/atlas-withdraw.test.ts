// Pins the schema half of 取消公開: both review_status CHECKs accept
// 'withdrawn' on every database, old or new.
//
// The behaviour — withdrawn vs takedown, reversible vs final, savers' rows
// untouched, the public image unlinked — runs against real PostgreSQL in
// tests/atlas-publication-postgres.test.ts.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const migrate = readFileSync(new URL("../scripts/migrate.ts", import.meta.url), "utf8");

test("both review_status constraints accept withdrawn", () => {
  assert.match(
    migrate,
    /atlas_public_items[\s\S]*?CHECK \(review_status IN \('approved','takedown','withdrawn'\)\)/,
  );
  assert.match(migrate, /'approved','rejected','takedown','withdrawn'/);
});

// A name-only guard would skip every database migrated before 'withdrawn'
// existed, leaving the constraint too narrow and every withdrawal failing.
test("the constraint swap is guarded on the definition, not the name", () => {
  assert.match(migrate, /pg_get_constraintdef\(oid\) LIKE '%withdrawn%'/);
});
