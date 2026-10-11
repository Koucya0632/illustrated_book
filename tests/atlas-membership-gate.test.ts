// Pins the 物見 membership gates (docs/MEMBERSHIP_ENGINEERING_CHECKLIST.md §5)
// and the retirement of the pre-credit 自製圖鑑 writes.
//
// THE RED LINE for the retired writes: upload, 識別, confirm and 補充 under
// /api/atlas spend nothing and store nothing. Each answers with one fixed
// refusal, so no released app can reach a model through them.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

for (const route of [
  "app/api/atlas/images/route.ts",
  "app/api/atlas/images/[id]/recognize/route.ts",
  "app/api/atlas/images/[id]/confirm/route.ts",
  "app/api/atlas/items/[id]/enrich/route.ts",
]) {
  test(`POST ${route} is the fixed refusal and nothing else`, () => {
    const src = read(route);
    const post = src.slice(src.indexOf("export async function POST"));
    assert.ok(post.includes("return refuseLegacyAtlasWrite(userId);"));
    // Nothing reads a body, touches storage or reaches a model.
    assert.ok(!/req\.|formData|sharp|Provider|enrich\w*\(|sql`/.test(post), post);
  });
}

test("the item detail read has no paid side effect", () => {
  const src = read("app/api/atlas/items/[id]/detail/route.ts");
  assert.ok(!/enrichAtlasItem|generateCreditEnrichment|maxDuration/.test(src));
});

// ---- 物見 (checklist §5): writes need membership, housekeeping never does ----

const handler = (src: string, method: string) => {
  const start = src.indexOf(`export async function ${method}(`);
  if (start < 0) return "";
  const next = src.indexOf("export async function", start + 10);
  return src.slice(start, next < 0 ? undefined : next);
};

const gated: [string, string][] = [
  ["app/api/atlas/collections/route.ts", "POST"],
  ["app/api/atlas/collections/[id]/route.ts", "PATCH"],
  ["app/api/atlas/collections/[id]/items/route.ts", "POST"],
  ["app/api/atlas/collections/[id]/avatar/route.ts", "POST"],
  ["app/api/atlas/collections/[id]/publish/route.ts", "POST"],
  ["app/api/atlas/items/[id]/publish/route.ts", "POST"],
  ["app/api/atlas/public/[slug]/save/route.ts", "POST"],
  ["app/api/atlas/public/collections/[slug]/save/route.ts", "POST"],
  ["app/api/atlas/public/collections/[slug]/learn/route.ts", "POST"],
];
for (const [file, method] of gated) {
  test(`${method} ${file} requires membership under v2`, () => {
    assert.ok(handler(read(file), method).includes("communityWriteRefusal("));
  });
}

const open: [string, string][] = [
  ["app/api/atlas/collections/[id]/route.ts", "DELETE"],
  ["app/api/atlas/collections/[id]/items/[publicItemId]/route.ts", "DELETE"],
  ["app/api/atlas/collections/[id]/withdraw/route.ts", "POST"],
  ["app/api/atlas/public/[slug]/save/route.ts", "DELETE"],
  ["app/api/atlas/public/collections/[slug]/save/route.ts", "DELETE"],
  ["app/api/atlas/public/[slug]/report/route.ts", "POST"],
  ["app/api/atlas/public/collections/[slug]/report/route.ts", "POST"],
];
for (const [file, method] of open) {
  test(`${method} ${file} stays open — deleting, withdrawing and reporting never need membership`, () => {
    const src = handler(read(file), method);
    assert.ok(src.length > 0, "handler exists");
    assert.ok(!src.includes("communityWriteRefusal("));
  });
}
