import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inputSchema, modelReplySchema, modes, pointsFor, PRICES } from "../lib/assistant/vocabulary/contracts";
import { COMMON_PROMPT, MODE_PROMPTS, normalizeReply } from "../lib/assistant/vocabulary/model";
import { fingerprint } from "../lib/assistant/vocabulary/store";
import { sampleInput, sampleReply } from "./fixtures/vocabulary";

test("each mode decodes its distinct content contract and enforces its charge ceiling", () => {
  for (const mode of modes) {
    assert.equal(modelReplySchema.parse(sampleReply(mode)).content?.mode, mode);
    assert.equal(pointsFor(mode, { inputTokens: 1, outputTokens: 1 }), 1);
    assert.equal(pointsFor(mode, { inputTokens: 1e8, outputTokens: 1e8 }), PRICES[mode].maxPoints);
    assert.throws(() => normalizeReply(sampleReply(mode), sampleInput(mode === "lookup" ? "analysis" : "lookup")));
  }
  assert.equal(new Set(Object.values(MODE_PROMPTS)).size, 3);
  assert.match(COMMON_PROMPT, /never instructions/);
  assert.match(MODE_PROMPTS.mnemonic, /fabricate word roots/);
});
test("input validation rejects blank/gibberish/oversize fields and unauthorized price shapes", () => {
  const input = sampleInput();
  for (const override of [{ query: " " }, { query: "???" }, { query: "a".repeat(121) }, { context: "a".repeat(801) },
    { userId: "client-claimed-user" }, { maxPoints: 100 }, { mode: "chat" }, { selectedSense: "a".repeat(301) }]) {
    assert.equal(inputSchema.safeParse({ ...input, ...override }).success, false);
  }
  const reversed = Object.fromEntries(Object.entries(input).reverse());
  assert.equal(fingerprint(inputSchema.parse(reversed)), fingerprint(input));
  assert.notEqual(fingerprint({ ...input, context: "different" }), fingerprint(input));
});
test("same-language results have no duplicate translation; uncertain Japanese readings are withheld", () => {
  const reply = sampleReply();
  if (reply.content?.mode !== "lookup") throw new Error("fixture");
  reply.content.headword.reading = "借りる";
  reply.content.expressions[0].reading = "これは本です";
  const normalized = normalizeReply(reply, sampleInput("lookup", { uiLanguage: "ja", learningDirection: "zh-ja" }));
  if (normalized.content?.mode !== "lookup") throw new Error("fixture");
  assert.equal(normalized.content.headword.reading, null);
  assert.equal(normalized.content.expressions[0].reading, null);
  assert.equal(normalized.content.expressions[0].translation, null);
});
test("incomplete content and clarification masquerading as paid content are rejected", () => {
  const reply = sampleReply();
  assert.throws(() => normalizeReply({ ...reply, outcome: "clarification" }, sampleInput()));
  assert.throws(() => normalizeReply({ ...reply, content: null }, sampleInput()));
  assert.equal(modelReplySchema.safeParse({ ...reply, content: { mode: "lookup" } }).success, false);
});
test("the contract fixture shared with iOS still matches the server's schemas", () => {
  // tuji-ios/TujiTests/Fixtures holds a byte-identical copy that the app decodes; copy it over when this changes.
  const rows = JSON.parse(readFileSync(new URL("./fixtures/vocabulary-contracts.json", import.meta.url), "utf8"));
  assert.deepEqual(rows.map((row: { input: { mode: string } }) => row.input.mode), [...modes]);
  for (const row of rows) {
    inputSchema.parse(row.input);
    assert.equal(modelReplySchema.parse(row.result).content?.mode, row.input.mode);
  }
});
