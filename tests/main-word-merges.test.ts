import assert from "node:assert/strict";
import test from "node:test";
import imageUrls from "../lib/image-urls.json";
import { MAIN_WORD_MERGES } from "../lib/main-word-merges";
import { words } from "../lib/words";

test("retired duplicate main words cannot return through seed data", () => {
  const wordIds = new Set(words.map((word) => word.id));
  const imageIds = new Set(Object.keys(imageUrls));

  for (const merge of MAIN_WORD_MERGES) {
    assert.equal(wordIds.has(merge.sourceId), false, `${merge.sourceId} remains in word seeds`);
    assert.equal(
      imageIds.has(merge.sourceId),
      false,
      `${merge.sourceId} remains in the canonical image map`,
    );
    assert.equal(wordIds.has(merge.targetId), true, `${merge.targetId} is missing from word seeds`);
    assert.equal(
      imageIds.has(merge.targetId),
      true,
      `${merge.targetId} is missing from the canonical image map`,
    );
  }
});
