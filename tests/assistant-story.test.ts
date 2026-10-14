import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { creditConfig } from "../lib/credits/policy";
import type { CreditBalance, CreditTransaction } from "../lib/credits/wallet";
import { AssistantError } from "../lib/assistant/contracts";
import { STORY_PRICING, storyPoints } from "../lib/assistant/pricing";
import { createStoryHandler } from "../lib/assistant/story/http";
import { findLevel } from "../lib/assistant/story/levels";
import type Anthropic from "@anthropic-ai/sdk";
import {
  createStoryModel, isMonolingual, lineFurigana, lineReading, missingWords, moira, storyPrompt,
  type Story, type StoryModelReply, type StoryModelRequest,
} from "../lib/assistant/story/model";
import { findScene } from "../lib/assistant/story/scenes";
import type { AssistantUsageRecord } from "../lib/assistant/usage";

// --- readings ----------------------------------------------------------------

test("a reading is kept only when it is all kana and keeps the line's own kana", () => {
  assert.equal(lineReading("三つ買います。", "みっつかいます。"), "みっつかいます。");
  // Kanji left in the reading.
  assert.equal(lineReading("いくつ買いますか。", "いくつ買いますか。"), null);
  // A line with no kanji needs none.
  assert.equal(lineReading("りんごがありますね。", "りんごがありますね。"), null);
  // Spaces and quotes the model adds are not part of the reading.
  assert.equal(lineReading("地図を見ましょう。", "「ちずを　みましょう。」"), "ちずをみましょう。");
});

test("katakana folded to hiragana in a reading is restored, not dropped", () => {
  assert.equal(lineReading("今日もパソコンを見ますか。", "きょうもぱそこんをみますか。"), "きょうもパソコンをみますか。");
});

test("a checked reading becomes kana over each kanji run", () => {
  assert.deepEqual(lineFurigana("三つ買います。", "みっつかいます。"), {
    furigana: [
      { text: "三", ruby: "みっ" }, { text: "つ", ruby: null }, { text: "買", ruby: "か" },
      { text: "います。", ruby: null },
    ],
  });
});

test("a line that cannot be split keeps its whole reading", () => {
  // Kana-only text has nothing to annotate.
  assert.deepEqual(lineFurigana("りんご", "りんご"), { reading: "りんご" });
});

// --- languages -----------------------------------------------------------------

test("only the interface language that is the one being learned is monolingual", () => {
  assert.equal(isMonolingual({ uiLanguage: "ja", learningDirection: "zh-ja" }), true);
  assert.equal(isMonolingual({ uiLanguage: "en", learningDirection: "zh-en" }), true);
  for (const uiLanguage of ["zh-Hant", "zh-Hans"] as const) {
    assert.equal(isMonolingual({ uiLanguage, learningDirection: "zh-ja" }), false);
  }
  assert.equal(isMonolingual({ uiLanguage: "ja", learningDirection: "zh-en" }), false);
  assert.equal(isMonolingual({ uiLanguage: "en", learningDirection: "zh-ja" }), false);
});

function fakeClient(parsed: Record<string, unknown>) {
  return { messages: { parse: async () => ({
    stop_reason: "end_turn", usage: { input_tokens: 1800, output_tokens: 1000 }, parsed_output: parsed,
  }) } } as unknown as Anthropic;
}
const modelReply = {
  title: "t", intro: "i",
  segments: [
    { speaker: "narrator", text: "n", reading: "", translation: "", word_ids: [] },
    { speaker: "cat", text: "りんごを三つ買います。", reading: "りんごをみっつかいます。", translation: "我買三個蘋果。",
      word_ids: ["apple"] },
  ],
  word_notes: [{ id: "apple", note: "赤くて丸い果物" }, { id: "invented", note: "x" }, { id: "apple", note: "y" }],
};
const storyRequest = (uiLanguage: StoryModelRequest["uiLanguage"]): StoryModelRequest => ({
  uiLanguage, learningDirection: "zh-ja", words: [apple],
  ...findScene("supermarket", "shopping")!, level: findLevel("starter")!,
});

test("a bilingual story keeps translations and drops word notes", async () => {
  const { story } = await createStoryModel(fakeClient(modelReply))(storyRequest("zh-Hant"));
  assert.equal(story.segments[1].translation, "我買三個蘋果。");
  assert.equal(story.wordNotes, undefined);
  assert.ok(story.segments[1].furigana);
  assert.equal(story.segments[1].reading, undefined);
});

test("a monolingual story drops translations and keeps one note per picked word", async () => {
  const { story } = await createStoryModel(fakeClient(modelReply))(storyRequest("ja"));
  assert.equal(story.segments[1].translation, undefined);
  assert.deepEqual(story.wordNotes, [{ id: "apple", note: "赤くて丸い果物" }]);
});

test("a monolingual story without a note for a word falls back to the dictionary gloss", async () => {
  const { story } = await createStoryModel(fakeClient({ ...modelReply, word_notes: [] }))(storyRequest("ja"));
  assert.deepEqual(story.wordNotes, [{ id: "apple", note: "蘋果" }]);
});

test("the cat is Moira whatever the model spelled", () => {
  assert.equal(moira("モイラと駅で電車を待つ"), "Moiraと駅で電車を待つ");
  assert.equal(moira("和莫伊拉一起買蘋果"), "和Moira一起買蘋果");
});

test("the prompt says which mode the story is in", () => {
  assert.match(storyPrompt(storyRequest("ja")), /Mode: monolingual/);
  assert.match(storyPrompt(storyRequest("en")), /Mode: bilingual/);
});

// --- picked items ------------------------------------------------------------

const apple = { id: "apple", word: "りんご", reading: "りんご", meaning: "蘋果" };
const pen = { id: "pen", word: "pen", meaning: "筆" };
const story = (...lines: string[]): Story => ({
  title: "t", intro: "i",
  segments: [
    { speaker: "narrator", text: "你看到りんご。", wordIds: [] },
    ...lines.map(text => ({ speaker: "cat" as const, text, wordIds: [] })),
  ],
});

test("an item counts as used only in a spoken line", () => {
  assert.deepEqual(missingWords(story("こんにちは。"), [apple]), ["apple"]);
  assert.deepEqual(missingWords(story("りんごがあります。"), [apple]), []);
  assert.deepEqual(missingWords(story("Two Pens, please."), [pen]), []);
});

test("the prompt carries the place, the situation, the level guide and the items", () => {
  const prompt = storyPrompt({
    uiLanguage: "zh-Hant", learningDirection: "zh-ja", words: [apple],
    ...findScene("supermarket", "shopping")!, level: findLevel("starter")!,
  });
  assert.match(prompt, /Place: Supermarket \(超市\)/);
  assert.match(prompt, /What is happening: Shopping \(買東西\)/);
  assert.match(prompt, /です\/ます form only/);
  assert.match(prompt, /"id":"apple"/);
});

// --- handler -----------------------------------------------------------------

const balance = (available: number) => ({ available, reconciliationRequired: false }) as CreditBalance;

interface Options {
  available?: number; reply?: Story; writeFails?: Error; unknownIds?: string[];
  usage?: { inputTokens: number; outputTokens: number };
}

function setup(options: Options = {}) {
  const written: StoryModelRequest[] = [];
  const charges: Array<{ key: string; points: number }> = [];
  const records: AssistantUsageRecord[] = [];
  let available = options.available ?? 100;
  const handler = createStoryHandler({
    currentUserId: async () => "server-user",
    config: () => creditConfig({ AI_CREDITS_MODE: "live", AI_CREDITS_ENVIRONMENT: "sandbox" }),
    enabled: () => true,
    wallet: () => ({
      readWallet: async () => balance(available),
      transact: async (_account, run) => {
        let reserved: { key: string; points: number } | undefined;
        return run({
          reserve: async (key: string, points: number) => {
            reserved = { key, points };
            return { operationKey: key, amount: points, state: "reserved" };
          },
          settle: async (key: string) => {
            charges.push(reserved!);
            available -= reserved!.points;
            return { operationKey: key, amount: reserved!.points, state: "committed", wallet: balance(available) };
          },
        } as unknown as CreditTransaction);
      },
    }),
    rateLimit: async () => {},
    loadWords: async ({ wordIds }) => wordIds.filter(id => !options.unknownIds?.includes(id))
      .map(id => ({ id, word: id === "apple" ? "りんご" : id, meaning: id })),
    write: async (request): Promise<StoryModelReply> => {
      written.push(request);
      if (options.writeFails) throw options.writeFails;
      return { story: options.reply ?? story("りんごを三つ買います。"), usage: options.usage ?? { inputTokens: 1800, outputTokens: 1000 } };
    },
    record: async entry => { records.push(entry); },
    reportError: () => {},
  });
  return { handler, written, charges, records };
}

const write = (data: Record<string, unknown> = {}) =>
  new Request("https://tuji.test/api/assistant/story", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requestId: randomUUID(), uiLanguage: "zh-Hant", learningDirection: "zh-ja", wordIds: ["apple"],
      sceneId: "supermarket", situationId: "shopping", levelId: "starter", ...data,
    }),
  });

test("the offer lists the choices in the interface language beside the price range", async () => {
  const { handler } = setup({ available: 42 });
  const body = await (await handler(new Request("https://tuji.test/api/assistant/story?uiLanguage=en"), "offer")).json();
  assert.equal(body.minPoints, STORY_PRICING.minPoints);
  assert.equal(body.maxPoints, STORY_PRICING.maxPoints);
  assert.equal(body.available, 42);
  const market = body.scenes.find((s: { id: string }) => s.id === "supermarket");
  assert.equal(market.label, "Supermarket");
  assert.ok(market.situations.some((s: { label: string }) => s.label === "Shopping"));
  assert.deepEqual(body.levels.map((l: { id: string }) => l.id), ["starter", "elementary", "intermediate"]);
});

test("a long story is charged what it cost, above the typical range", async () => {
  // 2,000 in + 8,000 out ≈ US$0.0042 × 3 ÷ 0.0007 = 18 points.
  const { handler, charges } = setup({ usage: { inputTokens: 2000, outputTokens: 8000 } });
  const body = await (await handler(write(), "write")).json();
  assert.equal(body.charged, 18);
  assert.equal(charges[0].points, 18);
  assert.ok(body.charged > STORY_PRICING.maxPoints);
});

test("a story costing more than the balance takes what is held, never more", async () => {
  const { handler, charges } = setup({ available: 12, usage: { inputTokens: 2000, outputTokens: 8000 } });
  const body = await (await handler(write(), "write")).json();
  assert.equal(charges[0].points, 12);
  assert.equal(body.available, 0);
});

test("a short story costs its tokens, not a floor", () => {
  assert.equal(storyPoints({ inputTokens: 100, outputTokens: 10 }), 1);
  assert.equal(storyPoints({ inputTokens: 2000, outputTokens: 700 }), 3);
});

test("a delivered story is charged by its tokens under its own key", async () => {
  const { handler, charges, records } = setup();
  const requestId = randomUUID();
  const response = await handler(write({ requestId }), "write");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.story.segments.length, 2);
  // 1,800 in + 1,000 out is 3 points at 3× cost — the floor.
  assert.deepEqual(charges, [{ key: `assistant-story:${requestId}`, points: 3 }]);
  assert.equal(body.charged, 3);
  assert.equal(records[0].feature, "story");
  assert.equal(records[0].pricingVersion, STORY_PRICING.version);
});

test("a story that leaves out a picked item is recorded, not delivered, not charged", async () => {
  const { handler, charges, records } = setup({ reply: story("こんにちは。") });
  const response = await handler(write(), "write");
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "assistant_unavailable" });
  assert.equal(charges.length, 0);
  assert.equal(records.length, 1);
  assert.equal(records[0].charged, 0);
  assert.equal(records[0].inScope, false);
});

test("bad choices and items never reach the model", async () => {
  for (const data of [
    { wordIds: [] },
    { wordIds: ["a", "b", "c", "d"] },
    { wordIds: ["apple", "apple"] },
    { wordIds: ["saved:someone-elses-card"] },
    { wordIds: ["atlas:not-a-uuid"] },
    { sceneId: "office", situationId: "shopping" },
    { levelId: "expert" },
    { extra: true },
  ]) {
    const { handler, written, charges } = setup();
    assert.equal((await handler(write(data), "write")).status, 400, JSON.stringify(data));
    assert.equal(written.length, 0);
    assert.equal(charges.length, 0);
  }
});

test("an item that does not resolve — someone else's card, a deleted one — never reaches the model", async () => {
  const card = `atlas:${randomUUID()}`;
  const { handler, written, records } = setup({ unknownIds: [card] });
  assert.equal((await handler(write({ wordIds: ["apple", card] }), "write")).status, 400);
  assert.equal(written.length, 0);
  assert.equal(records.length, 0);
});

test("a balance under the ceiling is refused before the model runs", async () => {
  const { handler, written } = setup({ available: STORY_PRICING.maxPoints - 1 });
  const response = await handler(write(), "write");
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "insufficient_credits");
  assert.equal(written.length, 0);
});

test("a model failure charges nothing", async () => {
  for (const [error, status] of [
    [new AssistantError("assistant_unavailable"), 503], [new AssistantError("rate_limited"), 429],
  ] as Array<[Error, number]>) {
    const { handler, charges } = setup({ writeFails: error });
    assert.equal((await handler(write(), "write")).status, status);
    assert.equal(charges.length, 0);
  }
});

test("a resend under the same request id is charged under the same key", async () => {
  const { handler, charges } = setup();
  const requestId = randomUUID();
  await handler(write({ requestId }), "write");
  await handler(write({ requestId: requestId.toUpperCase() }), "write");
  assert.deepEqual(new Set(charges.map(c => c.key)), new Set([`assistant-story:${requestId}`]));
});
