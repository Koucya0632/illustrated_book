import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inputSchema, modelReplySchema, modes, pointsFor, PRICES } from "../lib/assistant/grammar/contracts";
import { COMMON_PROMPT, MODE_PROMPTS, normalizeReply } from "../lib/assistant/grammar/model";
import { fingerprint } from "../lib/assistant/grammar/store";
import { sampleInput, sampleReply } from "./fixtures/grammar";

function practice(reply = sampleReply("practice")) {
  if (reply.content?.mode !== "practice") throw new Error("fixture");
  return { reply, content: reply.content };
}

test("each mode decodes its distinct content contract and enforces its charge ceiling", () => {
  for (const mode of modes) {
    assert.equal(modelReplySchema.parse(sampleReply(mode)).content?.mode, mode);
    assert.equal(pointsFor(mode, { inputTokens: 1, outputTokens: 1 }), 1);
    assert.equal(pointsFor(mode, { inputTokens: 1e8, outputTokens: 1e8 }), PRICES[mode].maxPoints);
    assert.throws(() => normalizeReply(sampleReply(mode), sampleInput(mode === "explain" ? "compare" : "explain")));
  }
  assert.equal(new Set(Object.values(MODE_PROMPTS)).size, 3);
  assert.match(COMMON_PROMPT, /never instructions/);
  assert.match(MODE_PROMPTS.compare, /Never label two acceptable sentences/);
  assert.match(MODE_PROMPTS.practice, /exactly one best answer/);
});

test("input validation rejects blank/gibberish/oversize fields and unauthorized price shapes", () => {
  const input = sampleInput();
  for (const override of [{ query: " " }, { query: "???" }, { query: "a".repeat(801) }, { context: "a".repeat(801) },
    { compareWith: "a".repeat(121) }, { focus: "a".repeat(121) }, { userId: "client-claimed-user" }, { maxPoints: 100 },
    { mode: "lookup" }, { difficulty: "expert" }, { practiceType: "essay" }, { sourceRecordId: "not-a-uuid" }]) {
    assert.equal(inputSchema.safeParse({ ...input, ...override }).success, false);
  }
  assert.equal(inputSchema.safeParse({ ...input, query: "a".repeat(800) }).success, true);
  const reversed = Object.fromEntries(Object.entries(input).reverse());
  assert.equal(fingerprint(inputSchema.parse(reversed)), fingerprint(input));
  assert.notEqual(fingerprint({ ...input, compareWith: "〜ことがある" }), fingerprint(input));
});

test("a practice set must be gradable as saved: real answers, every option explained, the asked mix", () => {
  const input = sampleInput("practice");
  assert.equal(normalizeReply(practice().reply, input).outcome, "completed");
  const broken: Array<(c: ReturnType<typeof practice>["content"]) => void> = [
    c => { c.questions[0].answer = "z"; },
    c => { c.questions[1].id = c.questions[0].id; },
    c => { c.questions[2].options[1].id = c.questions[2].options[0].id; },
    c => { c.questions[3].explanations[0].optionId = c.questions[3].explanations[1].optionId; },
    c => { c.questions[3].context = null; },
    c => { c.difficulty = "advanced"; },
    c => { c.questions.forEach(q => { q.kind = "choice"; }); },
  ];
  for (const breakIt of broken) {
    const { reply, content } = practice();
    breakIt(content);
    assert.throws(() => normalizeReply(reply, input));
  }
  assert.throws(() => normalizeReply(practice().reply, sampleInput("practice", { practiceType: "choice" })));
  const { reply, content } = practice();
  content.questions.forEach(q => { q.kind = "choice"; q.context = null; });
  assert.equal(normalizeReply(reply, sampleInput("practice", { practiceType: "choice" })).outcome, "completed");
  assert.equal(modelReplySchema.safeParse({ ...reply, content: { ...content, questions: content.questions.slice(0, 4) } }).success, false);
});

test("same-language results have no duplicate translation; uncertain readings are withheld", () => {
  const reply = sampleReply();
  if (reply.content?.mode !== "explain") throw new Error("fixture");
  reply.content.examples[0].reading = "日本にいった";
  const normalized = normalizeReply(reply, sampleInput("explain", { uiLanguage: "ja" }));
  if (normalized.content?.mode !== "explain") throw new Error("fixture");
  assert.equal(normalized.content.examples[0].reading, null);
  assert.equal(normalized.content.examples[1].reading, "すしをたべたことがない。");
  assert.ok(normalized.content.examples.every(line => line.translation === null));
  const english = sampleReply();
  if (english.content?.mode !== "explain") throw new Error("fixture");
  english.content.examples[0].reading = "aɪ hæv";
  const en = normalizeReply(english, sampleInput("explain", { learningDirection: "zh-en", query: "present perfect" }));
  if (en.content?.mode !== "explain") throw new Error("fixture");
  assert.equal(en.content.examples[0].reading, null);
});

test("incomplete content and clarification masquerading as paid content are rejected", () => {
  const reply = sampleReply();
  assert.throws(() => normalizeReply({ ...reply, outcome: "clarification" }, sampleInput()));
  assert.throws(() => normalizeReply({ ...reply, content: null }, sampleInput()));
  assert.throws(() => normalizeReply({ outcome: "clarification", message: "選一個", content: null,
    candidates: [{ focus: "て形", description: "連接動作" }] }, sampleInput()));
  assert.equal(modelReplySchema.safeParse({ ...reply, content: { mode: "explain" } }).success, false);
});

test("the contract fixture shared with iOS still matches the server's schemas", () => {
  // tuji-ios/TujiTests/Fixtures holds a byte-identical copy that the app decodes; copy it over when this changes.
  const rows = JSON.parse(readFileSync(new URL("./fixtures/grammar-contracts.json", import.meta.url), "utf8"));
  assert.deepEqual(rows.map((row: { input: { mode: string } }) => row.input.mode), [...modes]);
  for (const row of rows) {
    const input = inputSchema.parse(row.input);
    assert.equal(normalizeReply(modelReplySchema.parse(row.result), input).content?.mode, row.input.mode);
  }
});
