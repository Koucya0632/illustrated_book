// Pins the website's 跟著 Moira 去旅遊 pages (lib/travel/site.ts, app/travel).
//
// THE RED LINES:
//   - A closed spot has no page and no sitemap entry: a page listing five of
//     eight things would teach the wrong eight, and an indexed 404 is worse
//     than no page.
//   - The words shown are the 日文 ones, whatever the visitor is learning.
//   - Copy exists in all four interface languages; a missing key would print
//     an empty heading rather than fail.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { travelCopy } from "../lib/travel/site";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const LANGS = ["zh-Hant", "zh-Hans", "en", "ja"] as const;
const KEYS = ["title", "lead", "spots", "notOpen", "seenHere", "seenLead", "inApp"] as const;

test("every piece of copy exists in all four languages, with its placeholders filled", () => {
  for (const lang of LANGS) {
    for (const key of KEYS) {
      const text = travelCopy(lang, key, { name: "淺草", n: 8 });
      assert.ok(text.length > 0, `${lang} ${key} is empty`);
      assert.ok(!/[{}]/.test(text), `${lang} ${key} left a placeholder: ${text}`);
    }
  }
  assert.equal(travelCopy("zh-Hant", "seenHere", { name: "淺草" }), "淺草會看到的東西");
});

test("the site joins the spots to the 日文 dictionary and drops cities with nothing open", () => {
  const src = read("lib/travel/site.ts");
  assert.match(src, /getAllCardWords\(lang, "zh-ja"\)/);
  assert.match(src, /c\.spots\.some\(\(s\) => s\.open\)/);
});

test("a spot page exists only for an open spot of that city", () => {
  const src = read("app/travel/[city]/[spot]/page.tsx");
  assert.match(src, /s\.id === spotId && s\.open/);
  assert.match(src, /if \(!found\) notFound\(\)/);
  // The same lookup decides the metadata, so a closed spot gets neither.
  assert.equal(src.match(/await findSpot\(/g)?.length, 2);
});

test("the sitemap lists only open spots, and /travel only when there is somewhere to go", () => {
  const src = read("app/sitemap.ts");
  assert.match(src, /\.filter\(\(spot\) => spot\.open\)/);
  assert.match(src, /travel\.cities\.length > 0/);
});
