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
