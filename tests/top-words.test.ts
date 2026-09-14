// /api/users/top-words — 我's 需要加強 on iOS and Android.
//
// Every request to it was a 500 from the day `words.chinese` was dropped
// (scripts/migrate.ts) until this file existed: the query still selected the
// column. Neither client said so — both hide the section when the read fails —
// so it looked like an account with no weak words.

import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { topWords, type MasteryRankRow } from "../lib/top-words";
import type { Word } from "../types";

const word = (id: string, extra: Partial<Word> = {}): Word => ({
  id,
  word: id,
  category: "kitchen",
  partOfSpeech: "noun",
  pronunciation: `/${id}/`,
  imageUrl: `https://img.example.test/${id}.webp`,
  status: "published",
  definitions: [],
  chinese: `${id}-zh`,
  examples: [],
  ...extra,
} as Word);

const row = (word_id: string, mastery: number, review_count = 1): MasteryRankRow => ({
  word_id,
  mastery,
  review_count,
});

// MARK: - Shaping

test("rows keep the order the query ranked them in", () => {
  const out = topWords(
    [row("kettle", 12), row("ladle", 30), row("bowl", 55)],
    [word("bowl"), word("kettle"), word("ladle")],
    3,
  );
  assert.deepEqual(out.map((w) => w.id), ["kettle", "ladle", "bowl"]);
});

test("a word no longer in the catalogue is skipped and does not use up the limit", () => {
  // Unpublished, deleted, or a Japanese learner's row for a word with no ja
  // term: the client opens the word on tap, so a row it cannot open is dropped.
  const out = topWords(
    [row("gone", 1), row("kettle", 2), row("ladle", 3), row("bowl", 4)],
    [word("kettle"), word("ladle"), word("bowl")],
    2,
  );
  assert.deepEqual(out.map((w) => w.id), ["kettle", "ladle"]);
});

test("the word is the catalogue's, so it carries the reader's gloss and the learning term", () => {
  const [out] = topWords(
    [row("kettle", 20, 4)],
    [word("kettle", { word: "やかん", chinese: "Kettle", reading: "やかん", targetLanguage: "ja" })],
    1,
  );
  assert.equal(out.word, "やかん");
  assert.equal(out.chinese, "Kettle");
  assert.equal(out.reading, "やかん");
  assert.equal(out.targetLanguage, "ja");
  assert.equal(out.reviewCount, 4);
});

test("strings iOS decodes as non-optional are never null", () => {
  const [out] = topWords(
    [row("kettle", 20)],
    [word("kettle", {
      chinese: undefined as unknown as string,
      imageUrl: undefined as unknown as string,
      category: undefined as unknown as Word["category"],
    })],
    1,
  );
  assert.equal(out.chinese, "");
  assert.equal(out.imageUrl, "");
  assert.equal(out.category, "");
});

test("mastery is a whole number even when the driver hands back a string", () => {
  // `::float8` is in the query for this; the rounding is the second line.
  const [out] = topWords([row("kettle", "41.6" as unknown as number)], [word("kettle")], 1);
  assert.equal(out.mastery, 42);
});

// MARK: - The route

const route = readFileSync(new URL("../app/api/users/top-words/route.ts", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("the route ranks only the current learning language", () => {
  // user_words is keyed (user, word, target_language). Without the filter a
  // Japanese learner's 需要加強 listed the English words they struggle with.
  const queries = route.match(/sql<[^>]*>`[\s\S]*?`/g) ?? [];
  assert.equal(queries.length, 2);
  for (const q of queries) {
    assert.match(q, /uw\.target_language = \$\{targetLanguage\}/);
    assert.match(q, /mastery::float8/);
  }
  assert.match(route, /readLearningDirection\(req, settings\.learningDirection\)/);
  assert.match(route, /readLang\(req, settings\.uiLang\)/);
});

// MARK: - The column that is gone

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

test("no query in app/ or lib/ reads the dropped words.chinese column", () => {
  // `Word.chinese` is still a field on the object — built from word_definitions
  // — so only SQL is checked. scripts/migrate.ts is left out: its historical
  // backfills name the column on purpose, behind their own guards.
  const root = new URL("..", import.meta.url).pathname;
  const offenders = [...sourceFiles(join(root, "app")), ...sourceFiles(join(root, "lib"))]
    .flatMap((path) => {
      const src = readFileSync(path, "utf8");
      return (src.match(/sql(?:<[^>]*>)?`[\s\S]*?`/g) ?? [])
        .filter((q) => /\bFROM\s+words\b|\bJOIN\s+words\b/i.test(q))
        .filter((q) => /(?:\bw\.|\bwords\.|[\s,(])chinese\b(?!_)/.test(q))
        .map(() => path.slice(root.length));
    });
  assert.deepEqual(offenders, []);
});
