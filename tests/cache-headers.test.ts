import assert from "node:assert/strict";
import test from "node:test";
import { readLearningDirection } from "../lib/cache-headers";

test("explicit English direction overrides a stale Japanese fallback", () => {
  const request = new Request(
    "https://example.test/api/users/custom-words?lang=ja&learning=zh-en",
  );

  assert.equal(readLearningDirection(request, "zh-ja"), "zh-en");
});

test("explicit Japanese direction overrides a stale English fallback", () => {
  const request = new Request(
    "https://example.test/api/users/custom-words?lang=ja&learning=zh-ja",
  );

  assert.equal(readLearningDirection(request, "zh-en"), "zh-ja");
});

test("missing or invalid direction uses the fallback", () => {
  assert.equal(
    readLearningDirection(
      new Request("https://example.test/api/users/custom-words?lang=ja"),
      "zh-ja",
    ),
    "zh-ja",
  );
  assert.equal(
    readLearningDirection(
      new Request(
        "https://example.test/api/users/custom-words?lang=ja&learning=unknown",
      ),
      "zh-en",
    ),
    "zh-en",
  );
});
