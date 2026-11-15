import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { categories } from "../lib/categories";
const catalogueSync = readFileSync(new URL("../lib/catalogue/sync.ts", import.meta.url), "utf8");

const migrate = readFileSync(new URL("../scripts/migrate.ts", import.meta.url), "utf8");

test("community is immediately after custom in the canonical theme order", () => {
  const customIndex = categories.findIndex((category) => category.id === "custom");
  const communityIndex = categories.findIndex((category) => category.id === "community");

  assert.notEqual(customIndex, -1);
  assert.equal(communityIndex, customIndex + 1);
});

test("deploys refresh existing category sort orders from the canonical list", () => {
  assert.match(catalogueSync, /sort_order = EXCLUDED\.sort_order/);
});
