import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectionDescriptionFrom } from "../lib/atlas/collection-description";

test("a cleared 簡介 is saved as none, whether the app sends it empty or leaves it out", () => {
  // iOS and Android leave the key out when the field is empty.
  assert.equal(collectionDescriptionFrom({}), null);
  assert.equal(collectionDescriptionFrom({ description: undefined }), null);
  assert.equal(collectionDescriptionFrom({ description: null }), null);
  assert.equal(collectionDescriptionFrom({ description: "" }), null);
  assert.equal(collectionDescriptionFrom({ description: " \n " }), null);
});

test("a typed 簡介 is trimmed and capped at 500 characters", () => {
  assert.equal(collectionDescriptionFrom({ description: "  通勤路上\n" }), "通勤路上");
  assert.equal(collectionDescriptionFrom({ description: "字".repeat(600) })?.length, 500);
  assert.equal(collectionDescriptionFrom({ description: 42 }), null);
});

test("editing a 合集 no longer keeps the stored 簡介 when the request has none", () => {
  const route = readFileSync(
    new URL("../app/api/atlas/collections/[id]/route.ts", import.meta.url),
    "utf8",
  );
  const patch = route.slice(route.indexOf("export async function PATCH"));
  assert.match(patch, /collectionDescriptionFrom\(body\)/);
  assert.doesNotMatch(patch, /owned\.collection\.description/);
});
