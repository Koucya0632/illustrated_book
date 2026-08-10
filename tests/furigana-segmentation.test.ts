import assert from "node:assert/strict";
import test from "node:test";
import {
  parseFuriganaEntry,
  segmentFurigana,
  type FuriganaDict,
  type FuriganaSegment,
} from "../lib/kana";

// Real JmdictFurigana rows, copied verbatim from the 2.3.1+2026-07-25 release.
// Written in the dictionary's own `surface|reading|segments` line format so a
// row can be pasted straight out of the file when a case needs adding.
const ROWS = [
  "歯磨き粉|はみがきこ|0:は;1:みが;3:こ",
  "目覚まし|めざまし|0:め;1:ざ",
  "時計|とけい|0-1:とけい",
  "袋|ふくろ|0:ふくろ",
  "掃除|そうじ|0:そう;1:じ",
  "保湿|ほしつ|0:ほ;1:しつ",
  "爪切り|つめきり|0:つめ;1:き",
  "食|しょく|0:しょく",
  "器|き|0:き",
];

const dict: FuriganaDict = ROWS.reduce((map, row) => {
  const [surface, reading, segments] = row.split("|");
  const entries = map.get(surface) ?? [];
  entries.push({ reading, segments });
  map.set(surface, entries);
  return map;
}, new Map<string, { reading: string; segments: string }[]>());

/**
 * The two invariants every split must satisfy: it re-spells the headword, and
 * it re-spells the reading. A split that fails either is worse than no split —
 * it would print kana over a word that does not say them.
 */
function assertRoundTrip(term: string, reading: string, segs: FuriganaSegment[]) {
  assert.equal(segs.map((s) => s.text).join(""), term, "segments must re-spell the headword");
  assert.equal(
    segs.map((s) => s.ruby ?? s.text).join(""),
    reading,
    "segments must re-spell the reading"
  );
  for (const seg of segs) {
    assert.notEqual(seg.ruby, "", "a segment may carry no ruby, but never empty ruby");
  }
}

function split(term: string, reading: string): FuriganaSegment[] {
  const segs = segmentFurigana(term, reading, dict);
  assert.ok(segs, `expected a split for ${term}`);
  assertRoundTrip(term, reading, segs);
  return segs;
}

test("a headword the dictionary holds whole splits per kanji", () => {
  assert.deepEqual(split("歯磨き粉", "はみがきこ"), [
    { text: "歯", ruby: "は" },
    { text: "磨", ruby: "みが" },
    { text: "き", ruby: null },
    { text: "粉", ruby: "こ" },
  ]);
});

test("a compound absent from the dictionary is decomposed into sub-words", () => {
  // 掃除ブラシ is nobody's dictionary entry; 掃除 is, and ブラシ spells itself.
  assert.deepEqual(split("掃除ブラシ", "そうじブラシ"), [
    { text: "掃", ruby: "そう" },
    { text: "除", ruby: "じ" },
    { text: "ブ", ruby: null },
    { text: "ラ", ruby: null },
    { text: "シ", ruby: null },
  ]);
});

test("熟字訓 degrades to one block without dragging the rest of the word down", () => {
  // 時計 cannot be split — 時 is not と and 計 is not けい. The characters
  // before it still get their own ruby.
  assert.deepEqual(split("目覚まし時計", "めざましとけい"), [
    { text: "目", ruby: "め" },
    { text: "覚", ruby: "ざ" },
    { text: "ま", ruby: null },
    { text: "し", ruby: null },
    { text: "時計", ruby: "とけい" },
  ]);
});

test("連濁 is matched against the dictionary's unvoiced reading", () => {
  // 袋 is ふくろ on its own and ぶくろ here. Without this the whole word fails.
  assert.deepEqual(split("ゴミ袋", "ゴミぶくろ"), [
    { text: "ゴ", ruby: null },
    { text: "ミ", ruby: null },
    { text: "袋", ruby: "ぶくろ" },
  ]);
});

test("a final つ/く geminating before the next element is matched too", () => {
  // 食 しょく + 器 き → しょっき.
  assert.deepEqual(split("食器", "しょっき"), [
    { text: "食", ruby: "しょっ" },
    { text: "器", ruby: "き" },
  ]);
});

test("a word no dictionary path explains still anchors at run level", () => {
  // 豆板醤 is トウバンジャン, a borrowed Chinese pronunciation. Nothing splits
  // it, so the whole kanji run takes one block rather than losing its ruby.
  assert.deepEqual(split("豆板醤", "トウバンジャン"), [
    { text: "豆板醤", ruby: "トウバンジャン" },
  ]);
});

test("a headword already written in kana has nothing to annotate", () => {
  assert.equal(segmentFurigana("バスマット", "バスマット", dict), null);
});

test("a reading that cannot be aligned at all returns null", () => {
  // The reading lowercases the headword's MRT, so no anchor lines up. Better
  // no ruby than ruby placed over the wrong characters.
  assert.equal(
    segmentFurigana("MRT（台湾の地下鉄）", "mrt（たいわんのちかてつ）", dict),
    null
  );
});

test("parseFuriganaEntry expands a multi-character range as one segment", () => {
  assert.deepEqual(parseFuriganaEntry("時計", "0-1:とけい"), [
    { text: "時計", ruby: "とけい" },
  ]);
});

test("parseFuriganaEntry leaves uncovered characters bare", () => {
  assert.deepEqual(parseFuriganaEntry("爪切り", "0:つめ;1:き"), [
    { text: "爪", ruby: "つめ" },
    { text: "切", ruby: "き" },
    { text: "り", ruby: null },
  ]);
});

test("a split is never allowed to rewrite kana the headword spells itself", () => {
  // 保湿クリーム with a reading whose katakana was flattened — the damage the
  // 2026-08-06 repair exists for. 保湿 matches, but クリーム cannot align to
  // くりいむ, and no variant rule is permitted to bend the headword to fit.
  assert.equal(segmentFurigana("保湿クリーム", "ほしつくりいむ", dict), null);
});
