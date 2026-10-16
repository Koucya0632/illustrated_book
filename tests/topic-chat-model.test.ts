import assert from "node:assert/strict";
import test from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import {
  cleanPattern, createTopicChatModel, isMonolingual, shapeReview, shapeTurn, targetText, turnPrompt,
  type TopicMaterial, type TurnRequest,
} from "../lib/topic-chat/model";
import { earlierTurns, pickWords, spotRun } from "../lib/topic-chat/service";
import { fillingSentence, practisedTypes, reviewAnswerTypes, untriedTypes } from "../lib/topic-chat/answers";

const topic: TopicMaterial = {
  id: "street", name: "街上", nameEn: "Street",
  words: [{ id: "station", word: "駅", reading: "えき", meaning: "車站" }, { id: "park", word: "公園", reading: "こうえん", meaning: "公園" }],
};
const ja = { uiLanguage: "zh-Hant", learningDirection: "zh-ja" } as const;
const request: TurnRequest = { ...ja, topic, transcript: [], truncated: false, practised: [], earlier: [], task: { kind: "opening" } };

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
  spot: " The  Station exit ",
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
  // The spot is compared from turn to turn, so it is normalised.
  assert.equal(turn.spot, "station exit");
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

test("a review keeps only sentences it can point to, corrections only from Moira's next line", () => {
  const request = { ...ja, topics: ["街上"], untried: ["reason"], transcript: [
    { speaker: "moira" as const, id: "m1", text: "どこに行きたいですか？" },
    { speaker: "you" as const, id: "u1", text: "公園に行きたいです。", support: [] },
    { speaker: "moira" as const, id: "m2", text: "いいですね。何をしますか？" },
    { speaker: "you" as const, id: "u2", text: "花がきれいからです。", support: [] },
    { speaker: "moira" as const, id: "m3", text: "花がきれいだからですね。" },
    { speaker: "you" as const, id: "u3", text: "我想吃冰淇淋", support: [] },
    { speaker: "moira" as const, id: "m4", text: "アイスが食べたいです、と言います。いいですね。" },
  ] };
  const s = (message_id: string, kind: "as_said" | "corrected" | "expressed", text: string) =>
    ({ message_id, kind, text, reading: "", translation: "" });
  const review = shapeReview(request, {
    sentences: [
      s("u1", "as_said", "公園に行きたいです。"),
      s("u1", "as_said", "公園が好きです。"), // not what they said
      s("u2", "corrected", "花がきれいだからです。"), // in Moira's next line, punctuation aside
      s("u2", "corrected", "花はとてもきれいです。"), // a correction Moira never made
      s("m1", "as_said", "どこに行きたいですか？"), // not the person's
      s("u3", "expressed", "アイスが食べたいです。"),
    ],
    try_next: { answer_type: "what", text: "ケーキを食べます。", reading: "", translation: "" }, // already tried
  })!;
  assert.deepEqual(review.sentences.map(x => [x.messageId, x.kind, x.original]), [
    ["u3", "expressed", "我想吃冰淇淋"], ["u2", "corrected", "花がきれいからです。"], ["u1", "as_said", undefined],
  ]);
  assert.equal(review.tryNext, undefined);
  const tried = shapeReview(request, {
    sentences: [], try_next: { answer_type: "reason", text: "暑いからです。", reading: "", translation: "" },
  })!;
  assert.equal(tried.tryNext?.answerType, "reason");
  assert.equal(shapeReview(request, { sentences: [], try_next: { answer_type: "none", text: "", reading: "", translation: "" } }), null);
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
  const client = { messages: { create: async () => {
    calls++;
    return { stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 10 },
      content: [{ type: "text", text: JSON.stringify(calls === 1 ? { ...raw, line: "" } : raw) }] };
  } } } as unknown as Anthropic;
  const generated = await createTopicChatModel(client).turn(request);
  assert.equal(calls, 2);
  assert.equal(generated.usage.inputTokens, 200);
  assert.equal(generated.value.options.length, 3);
});

test("a reply off the schema is asked for once more, not thrown", async () => {
  let calls = 0;
  const client = { messages: { create: async () => {
    calls++;
    return { stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 10 },
      content: [{ type: "text", text: JSON.stringify(calls === 1 ? { ...raw, answer_type: "no question" } : raw) }] };
  } } } as unknown as Anthropic;
  const generated = await createTopicChatModel(client).turn(request);
  assert.equal(calls, 2);
  assert.equal(generated.usage.inputTokens, 200);
});

test("two unusable replies are a failure that still reports what was spent", async () => {
  const client = { messages: { create: async () => ({
    stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 10 },
    content: [{ type: "text", text: JSON.stringify({ ...raw, line: "" }) }],
  }) } } as unknown as Anthropic;
  await assert.rejects(createTopicChatModel(client).turn(request), (error: { code: string; usage: { inputTokens: number } }) =>
    error.code === "assistant_unavailable" && error.usage.inputTokens === 200);
});

test("a pattern loses an answer-type name in front of it and must have exactly one blank", () => {
  assert.equal(cleanPattern("where:＿＿に座ります"), "＿＿に座ります");
  assert.equal(cleanPattern("what what: I buy ___"), "I buy ___");
  assert.equal(cleanPattern("＿＿＿＿を飲みます"), "＿＿を飲みます");
  assert.equal(cleanPattern("I buy ___ with ___"), null);
  assert.equal(cleanPattern("I buy bread."), null);
  assert.equal(shapeTurn(request, { ...raw, pattern: "who: I buy ___ with ___" })!.pattern, undefined);
});

test("the prompt lists earlier lines it does not show and asks for another kind after two of the same", () => {
  const earlier = [
    { id: "m1", type: "what", line: "何を飲みますか？" },
    { id: "m2", type: null, line: "Moiraは梅酒が好きです。" },
    { id: "m3", type: "what", line: "何を食べますか？" },
  ];
  const prompt = turnPrompt({ ...request, earlier, transcript: [{ speaker: "moira", id: "m3", text: "何を食べますか？" }] });
  assert.match(prompt, /<your_earlier_lines>\n- \[asked, answer type what\] 何を飲みますか？\n- \[said\] Moiraは梅酒が好きです。\n<\/your_earlier_lines>/);
  assert.match(prompt, /last 2 questions were both "what"/);
  assert.match(prompt, /not asked yet: reason, experience/);
  assert.doesNotMatch(turnPrompt({ ...request, earlier: [earlier[0], { id: "m4", type: "where", line: "どこ？" }] }), /were both/);
  assert.doesNotMatch(turnPrompt(request), /your_earlier_lines/);
});

test("five turns in one spot of the scene get a nudge to move on", () => {
  assert.match(turnPrompt({ ...request, spotRun: { spot: "bakery section", turns: 5 } }), /at "bakery section" for 5 turns/);
  assert.doesNotMatch(turnPrompt({ ...request, spotRun: { spot: "bakery section", turns: 4 } }), /move the scene on/);
});

const ai = (id: string, topicVersion: number, awaitsAnswer: boolean, extra: { key?: string; spot?: string } = {}) => ({
  id, kind: "ai" as const, topicId: "t", topicVersion, requestId: id, createdAt: new Date(),
  body: {
    line: { text: id }, awaitsAnswer,
    ...(extra.key ? { pattern: { key: extra.key, template: "＿＿" } } : {}),
    ...(extra.spot ? { spot: extra.spot } : {}),
  },
});

test("earlier turns come from this topic, with the answer type of those that asked something", () => {
  const earlier = earlierTurns([ai("old", 1, true, { key: "what" }), ai("a", 2, true, { key: "where" }), ai("b", 2, false), ai("c", 2, true)], 2);
  assert.deepEqual(earlier, [{ id: "a", type: "where", line: "a" }, { id: "b", type: null, line: "b" }, { id: "c", type: "none", line: "c" }]);
});

test("a spot run counts the latest turns of this topic in the same spot", () => {
  const user = { id: "u", kind: "user" as const, topicId: "t", topicVersion: 2, requestId: "u", createdAt: new Date(), body: { text: "x", support: [] } };
  assert.deepEqual(spotRun([ai("a", 2, true, { spot: "checkout" }), ai("b", 2, true, { spot: "bakery" }), user, ai("c", 2, true, { spot: "bakery" })], 2),
    { spot: "bakery", turns: 2 });
  assert.equal(spotRun([ai("a", 1, true, { spot: "bakery" })], 2), undefined);
  assert.equal(spotRun([ai("a", 2, true)], 2), undefined);
});

test("an answer counts for its 答法 only when it has the 跟著說's shape, or was a picked option", () => {
  assert.equal(fillingSentence("＿＿からです", "すっきりしているからです。"), "すっきりしているからです。");
  assert.equal(fillingSentence("I buy ___.", "I buy tofu. My son like tofu too."), "I buy tofu.");
  assert.equal(fillingSentence("はい、＿＿たことがあります", "はい、ひまわりを見たことがあります。台湾でも見ました。"), "はい、ひまわりを見たことがあります。");
  assert.equal(fillingSentence("＿＿からです", "からです"), null);
  assert.equal(fillingSentence("＿＿を飲みます", "ビール。"), null);
  const row = (id: string, kind: "ai" | "user" | "topic", body: object, topicVersion = 1) =>
    ({ id, kind, topicId: "t", topicVersion, requestId: id, createdAt: new Date(), body: body as never });
  const ask = (id: string, key: string, template: string) =>
    row(id, "ai", { line: { text: id }, awaitsAnswer: true, pattern: { key, template }, options: [], keywords: [], wordIds: [] });
  const messages = [
    ask("a1", "what", "＿＿を飲みます"), row("u1", "user", { text: "ビールを飲みます。", support: [] }),
    ask("a2", "reason", "＿＿からです"), row("u2", "user", { text: "わかりません", support: [] }),
    ask("a3", "where", "＿＿で飲みます"), row("u3", "user", { text: "家で飲みます。", support: ["option"] }),
    ask("a4", "experience", "＿＿たことがあります"), row("t", "topic", { name: "x" }, 2), row("u4", "user", { text: "行ったことがあります", support: [] }, 2),
  ];
  assert.deepEqual(practisedTypes(messages), ["what", "where"]);
  assert.deepEqual(reviewAnswerTypes(messages).map(a => a.type), ["where", "what"]);
  assert.ok(untriedTypes(messages).includes("reason"));
  assert.ok(!untriedTypes(messages).includes("what"));
});
