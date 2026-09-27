// Pins the over-cap lock after Pro ends (docs/MEMBERSHIP_ENGINEERING_CHECKLIST.md
// §4, decided 2026-09-27: keep the most recent 20 automatically, lock the rest,
// delete nothing). v2 only.
//
// THE RED LINES:
//   - During the grace (PRO_GRACE_DAYS) nothing is locked (only adding is capped).
//   - The kept set is by creation time, newest first — never by recent use,
//     which would make locked items rotate as the user studies.
//   - Every study read is forced to decide: fetchAtlasDue / atlasStudyStats /
//     atlasCategoryProgress take excludeItemIds with no default, so a new
//     caller cannot silently serve locked items.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { atlasItemsToLock } from "../lib/atlas/item-lock";

const ids = Array.from({ length: 25 }, (_, i) => `item-${String(i).padStart(2, "0")}`); // newest first

test("v1 locks nothing", () => {
  assert.deepEqual(atlasItemsToLock({ policy: "v1", tier: "free", graceActive: false, keep: 3 }, ids), []);
});

test("Pro locks nothing", () => {
  assert.deepEqual(atlasItemsToLock({ policy: "v2", tier: "pro", graceActive: false, keep: 300 }, ids), []);
});

test("lifetime inside the grace locks nothing", () => {
  assert.deepEqual(atlasItemsToLock({ policy: "v2", tier: "lifetime", graceActive: true, keep: 20 }, ids), []);
});

test("lifetime after the grace keeps the newest 20 and locks the older 5", () => {
  assert.deepEqual(
    atlasItemsToLock({ policy: "v2", tier: "lifetime", graceActive: false, keep: 20 }, ids),
    ids.slice(20),
  );
});

test("at or under the cap nothing is locked", () => {
  assert.deepEqual(
    atlasItemsToLock({ policy: "v2", tier: "lifetime", graceActive: false, keep: 20 }, ids.slice(0, 20)),
    [],
  );
});

test("a v2 non-member (0 slots) has every legacy item locked", () => {
  assert.deepEqual(atlasItemsToLock({ policy: "v2", tier: "free", graceActive: false, keep: 0 }, ids), ids);
});

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the study reads take excludeItemIds with no default", () => {
  const db = read("lib/atlas-db.ts");
  for (const fn of ["fetchAtlasDue", "atlasStudyStats", "atlasCategoryProgress"]) {
    const sig = db.slice(db.indexOf(`export async function ${fn}(`), db.indexOf("{", db.indexOf(`export async function ${fn}(`) + 30));
    assert.match(sig, /excludeItemIds: readonly string\[\]/, `${fn} must require excludeItemIds`);
    assert.ok(!/excludeItemIds: readonly string\[\] =/.test(sig), `${fn} must not default it`);
  }
});

test("the atlas answer path refuses locked items with a 200, like the study gate", () => {
  const src = read("app/api/study/answer/route.ts");
  assert.ok(src.includes("getLockedAtlasItemIds("));
});

for (const route of [
  "app/api/atlas/items/[id]/cards/route.ts",
  "app/api/atlas/items/[id]/enrich/route.ts",
  "app/api/atlas/items/[id]/publish/route.ts",
  "app/api/atlas/items/[id]/detail/route.ts",
]) {
  test(`${route} checks the lock`, () => {
    assert.ok(read(route).includes("isAtlasItemLocked("));
  });
}

test("deleting a locked item stays open", () => {
  const src = read("app/api/atlas/items/[id]/route.ts");
  const del = src.slice(src.indexOf("export async function DELETE"));
  assert.ok(!del.includes("isAtlasItemLocked("));
});
