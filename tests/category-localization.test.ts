import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { categories } from "../lib/categories";
import { localizeCategory } from "../lib/word-localize";
import type { Category } from "../types";

const migrate = readFileSync(new URL("../scripts/migrate.ts", import.meta.url), "utf8");

const base: Category = {
  id: "kitchen",
  name: "Kitchen",
  nameZh: "廚房",
  emoji: "🍳",
  description: "煮飯做菜的好地方",
  descriptionEn: "Where the cooking happens",
  color: "",
  imageUrl: "",
};

test("en reads the English name and description", () => {
  const c = localizeCategory(base, "en");
  assert.equal(c.nameZh, "Kitchen");
  assert.equal(c.description, "Where the cooking happens");
});

test("ja reads the overlay row's name and description", () => {
  const c = localizeCategory(base, "ja", {
    ja: { name: "キッチン", description: "料理をする場所" },
  });
  assert.equal(c.nameZh, "キッチン");
  assert.equal(c.description, "料理をする場所");
});

// The whole point of the per-field fallback: a category the translate pipeline
// named but never described must still show a description, not an empty line.
test("a translated name with no translated description keeps the zh-Hant one", () => {
  const c = localizeCategory(base, "ja", { ja: { name: "キッチン" } });
  assert.equal(c.nameZh, "キッチン");
  assert.equal(c.description, "煮飯做菜的好地方");
});

test("no overlay row at all falls back to zh-Hant for both fields", () => {
  const c = localizeCategory(base, "ja");
  assert.equal(c.nameZh, "廚房");
  assert.equal(c.description, "煮飯做菜的好地方");
});

test("a category with no English description falls back to zh-Hant", () => {
  const { descriptionEn: _omitted, ...withoutEn } = base;
  const c = localizeCategory(withoutEn as Category, "en");
  assert.equal(c.nameZh, "Kitchen");
  assert.equal(c.description, "煮飯做菜的好地方");
});

test("zh-Hans converts both fields", () => {
  const c = localizeCategory(base, "zh-Hans");
  assert.equal(c.nameZh, "厨房");
  assert.equal(c.description, "煮饭做菜的好地方");
});

test("every seed category carries an English description", () => {
  const missing = categories.filter((c) => !c.descriptionEn).map((c) => c.id);
  assert.deepEqual(missing, [], `categories missing descriptionEn: ${missing.join(", ")}`);
});

// The columns only reach a reader if migrate creates them and the seed keeps
// them in sync — the same gap that let 社群圖鑑 survive a rename in production.
test("deploys create and refresh the description columns", () => {
  assert.match(migrate, /ALTER TABLE categories ADD COLUMN IF NOT EXISTS description_en TEXT/);
  assert.match(
    migrate,
    /ALTER TABLE category_translations ADD COLUMN IF NOT EXISTS description TEXT/,
  );
  assert.match(migrate, /description_en = EXCLUDED\.description_en/);
});
