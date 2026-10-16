import assert from "node:assert/strict";
import test from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import {
  createTopicChatModel, isMonolingual, shapeReview, shapeTurn, targetText, turnPrompt,
  type TopicMaterial, type TurnRequest,
} from "../lib/topic-chat/model";
import { pickWords } from "../lib/topic-chat/service";

const topic: TopicMaterial = {
  id: "street", name: "街上", nameEn: "Street",
  words: [{ id: "station", word: "駅", reading: "えき", meaning: "車站" }, { id: "park", word: "公園", reading: "こうえん", meaning: "公園" }],
};
const ja = { uiLanguage: "zh-Hant", learningDirection: "zh-ja" } as const;
const request: TurnRequest = { ...ja, topic, transcript: [], truncated: false, practised: [], task: { kind: "opening" } };

const raw = {
  intent: "share" as const, scene: "想像散步 · モイラ 是你的同行夥伴",
  line: "駅と コンビニが 見えます。あなたは、どこに行きたいですか？", line_reading: "えきとこんびにがみえます。あなたは、どこにいきたいですか？",
  line_translation: "可以看到車站和便利商店。你想去哪裡？", awaits_answer: true,
  answer_type: "want_to" as const, pattern: "＿＿に 行きたいです。", pattern_translation: "我想去＿＿。",
  example: "公園に行きたいです。", example_reading: "こうえんにいきたいです。", example_translation: "我想去公園。",
  options: [
    { label: "公園", answer: "公園に行きたいです。", answer_reading: "こうえんにいきたいです。", answer_translation: "我想去公園。" },
    { label: "駅", answer: "駅に行きたいです。", answer_reading: "えきにいきたいです。", answer_translation: "我想去車站。" },
    { label: "公園", answer: "公園に行きたいです。", answer_reading: "こうえんにいきたいです。", answer_translation: "重複" },
    { label: "本屋", answer: "本屋に行きたいです。", answer_reading: "ほんやにいきたいです。", answer_translation: "我想去書店。" },
    { label: "家", answer: "家に帰りたいです。", answer_reading: "いえにかえりたいです。", answer_translation: "我想回家。" },
  ],
  keywords: [{ text: "駅", reading: "えき", meaning: "車站", word_id: "station" }, { text: "本屋", reading: "ホンヤ漢", meaning: "書店", word_id: "made-up" }],
  word_ids: ["park", "nonexistent"],
};

test("a turn is cleaned before it is shown", () => {
  const turn = shapeTurn(request, raw)!;
  // An opening is an opening whatever the model called it; Moira keeps her name.
  assert.equal(turn.intent, "opening");
  assert.equal(turn.scene, "想像散步 · Moira 是你的同行夥伴");
  // Japanese loses its spaces and gets furigana over the kanji.
  assert.equal(turn.line.text, "駅とコンビニが見えます。あなたは、どこに行きたいですか？");
  assert.ok(turn.line.furigana?.some(segment => segment.ruby === "えき"));
  assert.equal(turn.pattern?.template, "＿＿に行きたいです。");
  // At most three options, no duplicates.
  assert.deepEqual(turn.options.map(o => o.label), ["公園", "駅", "本屋"]);
  // Only supplied ids reach the app; a bad reading is dropped, not shown.
  assert.deepEqual(turn.wordIds, ["park", "station"]);
  assert.deepEqual(turn.keywords.map(k => [k.text, k.reading, k.wordId]), [["駅", "えき", "station"], ["本屋", undefined, undefined]]);
});

test("a pattern without a blank is no pattern; an empty line is no turn", () => {
  assert.equal(shapeTurn(request, { ...raw, pattern: "公園に行きたいです。" })!.pattern, undefined);
  assert.equal(shapeTurn(request, { ...raw, answer_type: "none" })!.pattern, undefined);
  assert.equal(shapeTurn(request, { ...raw, line: "  " }), null);
  // Only an opening is called one.
  assert.equal(shapeTurn({ ...request, task: { kind: "another" } }, { ...raw, intent: "opening" })!.intent, "share");
});

test("monolingual mode carries no translations", () => {
  assert.equal(isMonolingual({ uiLanguage: "ja", learningDirection: "zh-ja" }), true);
  const turn = shapeTurn({ ...request, uiLanguage: "ja" }, raw)!;
  assert.equal(turn.line.translation, undefined);
  assert.equal(turn.options[0].answer.translation, undefined);
  assert.equal(turn.pattern?.translation, undefined);
});

test("English keeps its spaces and has no reading", () => {
  const text = targetText({ uiLanguage: "zh-Hant", learningDirection: "zh-en" }, " I'd like to go to the park. ", "x", "我想去公園。");
  assert.deepEqual(text, { text: "I'd like to go to the park.", translation: "我想去公園。" });
});

test("a review keeps only phrases it can point to, and no more of the person's than they said", () => {
  const review = shapeReview({ ...ja, topics: ["街上"], transcript: [
    { speaker: "moira", id: "m1", text: "どこに行きたいですか？" },
    { speaker: "you", id: "u1", text: "公園に行きたいです。", support: [] },
  ] }, {
    phrases: [
      { message_id: "u1", source: "you", text: "公園に行きたいです。", reading: "こうえんにいきたいです。", translation: "我想去公園。" },
      { message_id: "u1", source: "you", text: "公園が好きです。", reading: "", translation: "" },
      { message_id: "m1", source: "you", text: "どこに行きたいですか？", reading: "", translation: "" },
      { message_id: "zzz", source: "moira", text: "嘘", reading: "", translation: "" },
      { message_id: "m1", source: "moira", text: "どこに行きたいですか？", reading: "", translation: "" },
    ],
    try_next: { text: "", reading: "", translation: "" },
    next_idea: "下次聊聊公園裡做什麼。",
  })!;
  assert.deepEqual(review.phrases.map(p => [p.messageId, p.source]), [["u1", "you"], ["m1", "moira"]]);
  assert.equal(review.tryNext, undefined);
});

test("the prompt says what to do and marks the person's text as theirs", () => {
  const prompt = turnPrompt({ ...request, task: { kind: "reply", answer: "公園。", support: ["option"] },
    transcript: [{ speaker: "topic", name: "街上" }, { speaker: "moira", id: "a", text: "どこ？" }], truncated: true });
  assert.match(prompt, /Language being learned: Japanese/);
  assert.match(prompt, /Earlier messages are not shown/);
  assert.match(prompt, /<person_message>\n公園。\n<\/person_message>/);
  assert.match(prompt, /They used: option/);
  assert.match(prompt, /"id":"station"/);
});

test("words the chat already touched come first", () => {
  const words = Array.from({ length: 50 }, (_, i) => ({ id: `w${i}`, word: `w${i}`, meaning: "" }));
  const messages = [{ id: "x", kind: "ai" as const, topicId: "t", topicVersion: 1, requestId: "r", createdAt: new Date(),
    body: { wordIds: ["w45"], keywords: [{ text: "k", meaning: "", wordId: "w49" }] } }];
  const picked = pickWords(words, messages, 40);
  assert.equal(picked.length, 40);
  assert.deepEqual(picked.slice(0, 2).map(w => w.id), ["w45", "w49"]);
});

test("a reply that cannot be shown is asked for once more, and the tokens of both are counted", async () => {
  let calls = 0;
  const client = { messages: { parse: async () => {
    calls++;
    return { stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 10 },
      parsed_output: calls === 1 ? { ...raw, line: "" } : raw };
  } } } as unknown as Anthropic;
  const generated = await createTopicChatModel(client).turn(request);
  assert.equal(calls, 2);
  assert.equal(generated.usage.inputTokens, 200);
  assert.equal(generated.value.options.length, 3);
});

test("two unusable replies are a failure that still reports what was spent", async () => {
  const client = { messages: { parse: async () => ({
    stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 10 }, parsed_output: { ...raw, line: "" },
  }) } } as unknown as Anthropic;
  await assert.rejects(createTopicChatModel(client).turn(request), (error: { code: string; usage: { inputTokens: number } }) =>
    error.code === "assistant_unavailable" && error.usage.inputTokens === 200);
});
