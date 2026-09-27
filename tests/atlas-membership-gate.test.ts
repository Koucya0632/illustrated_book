// Pins the 個人圖鑑 membership gates (docs/MEMBERSHIP_ENGINEERING_CHECKLIST.md
// §4). Both are no-ops under policy v1.
//
// THE RED LINES:
//   - v2 non-members (0 slots) and members at their cap are turned away from
//     the upload BEFORE the image is stored or any AI runs — the old order
//     stored first and checked the AI budget after.
//   - v2 non-members never trigger a paid 補充 pass on legacy items. Both
//     callers of enrichAtlasItem (the POST and the detail GET's lazy enrich) go
//     through the same account-aware check, so neither can be the one missed.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { accountMayEnrich } from "../lib/atlas/enrich-policy";

test("enrich is allowed for everyone under v1, and for members under v2", () => {
  assert.equal(accountMayEnrich({ tier: "free", policy: "v1" }), true);
  assert.equal(accountMayEnrich({ tier: "lifetime", policy: "v2" }), true);
  assert.equal(accountMayEnrich({ tier: "pro", policy: "v2" }), true);
});

test("enrich is refused for v2 non-members", () => {
  assert.equal(accountMayEnrich({ tier: "free", policy: "v2" }), false);
});

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

for (const route of ["app/api/atlas/items/[id]/enrich/route.ts", "app/api/atlas/items/[id]/detail/route.ts"]) {
  test(`${route} asks the account-aware check, not the item-only one`, () => {
    const src = read(route);
    assert.ok(src.includes("shouldEnrichForAccount("), "must use the account-aware check");
    assert.ok(!/shouldEnrichAtlasItem\(/.test(src), "must not call the item-only check directly");
  });
}

test("the upload checks the account before it stores anything", () => {
  const src = read("app/api/atlas/images/route.ts");
  const post = src.slice(src.indexOf("export async function POST"));
  const gate = post.indexOf("checkAtlasUploadAllowed(");
  assert.ok(gate > 0, "upload must call checkAtlasUploadAllowed");
  assert.ok(gate < post.indexOf("req.formData()"), "gate before reading the body");
  assert.ok(gate < post.indexOf("uploadAtlasImageBuffers("), "gate before storage");
});
