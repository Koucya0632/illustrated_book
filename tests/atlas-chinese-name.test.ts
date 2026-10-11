import test from "node:test";
import assert from "node:assert/strict";
import { confirmedChineseName, needsChineseName } from "../lib/atlas/gloss";

const candidate = { label: "keyboard", zh_hant: "鍵盤" };

test("an untouched candidate keeps its Chinese name on every interface", () => {
  for (const chineseFieldHidden of [true, false]) {
    for (const submitted of ["鍵盤", undefined]) {
      assert.equal(confirmedChineseName({ lemma: "keyboard", submitted, candidate, chineseFieldHidden }), "鍵盤");
    }
  }
});

test("a rename on a ja/en interface drops the Chinese name it could not see", () => {
  // Shipped clients still send the candidate's name beside the corrected lemma.
  assert.equal(
    confirmedChineseName({ lemma: "laptop", submitted: "鍵盤", candidate, chineseFieldHidden: true }),
    "laptop",
  );
  // Current clients omit it.
  assert.equal(
    confirmedChineseName({ lemma: "laptop", submitted: undefined, candidate, chineseFieldHidden: false }),
    "laptop",
  );
});

test("a Chinese interface that renames and keeps the Chinese name is believed", () => {
  // cup → mug with 杯子 left alone is a deliberate answer, not a stale one.
  assert.equal(
    confirmedChineseName({ lemma: "laptop", submitted: "鍵盤", candidate, chineseFieldHidden: false }),
    "鍵盤",
  );
  assert.equal(
    confirmedChineseName({ lemma: "laptop", submitted: "筆電", candidate, chineseFieldHidden: true }),
    "筆電",
  );
});

test("a candidate without a Chinese name is matched on the label clients prefill", () => {
  const bare = { label: "keyboard", zh_hant: null };
  assert.equal(
    confirmedChineseName({ lemma: "laptop", submitted: "keyboard", candidate: bare, chineseFieldHidden: true }),
    "laptop",
  );
});

test("a manual card with no candidate falls back to the lemma", () => {
  assert.equal(
    confirmedChineseName({ lemma: "laptop", submitted: undefined, candidate: null, chineseFieldHidden: true }),
    "laptop",
  );
  assert.equal(
    confirmedChineseName({ lemma: "laptop", submitted: "筆電", candidate: null, chineseFieldHidden: true }),
    "筆電",
  );
});

test("the lemma stand-in is what asks the enrich pass for a Chinese name", () => {
  assert.equal(needsChineseName({ lemma: "laptop", display_zh_hant: "laptop" }), true);
  assert.equal(needsChineseName({ lemma: "laptop", display_zh_hant: "筆電" }), false);
});

// ---- which name lands in which column (lib/atlas/item-writes.ts) ----

import { confirmedNames } from "../lib/atlas/item-writes";

const cat = { label: "猫", zh_hant: "貓", gloss: "cat" };

test("an untouched candidate is stored as the candidate, gloss in the run's language", () => {
  const names = confirmedNames({ candidate: cat, correction: {}, glossLanguage: "en", chineseFieldHidden: true });
  assert.deepEqual(names, { lemma: "猫", displayZhHant: "貓", displayJa: null, displayEn: "cat", source: "candidate" });
});

test("a run that asked for no gloss stores none, whatever the client sends", () => {
  const names = confirmedNames({ candidate: cat, correction: { displayGloss: "kitty" }, glossLanguage: null, chineseFieldHidden: false });
  assert.deepEqual([names.displayJa, names.displayEn, names.source], [null, null, "candidate"]);
});

test("a corrected gloss replaces the candidate's and marks the card manual", () => {
  const names = confirmedNames({ candidate: cat, correction: { displayGloss: "kitty" }, glossLanguage: "en", chineseFieldHidden: true });
  assert.deepEqual([names.displayEn, names.source], ["kitty", "manual"]);
});

test("a rename on a cross-language run drops the Chinese name it could not see", () => {
  const names = confirmedNames({ candidate: cat, correction: { lemma: "犬", displayZhHant: "貓" }, glossLanguage: "en", chineseFieldHidden: true });
  assert.deepEqual([names.lemma, names.displayZhHant, names.source], ["犬", "犬", "manual"]);
});
