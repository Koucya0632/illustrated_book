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
  type Story, type StoryModelReply, type StoryModelRequest, type StoryPart,
} from "../lib/assistant/story/model";
import { createReplyScanner } from "../lib/assistant/story/reply-scanner";
import { STORY_SCENES, findScene } from "../lib/assistant/story/scenes";
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

/** A model that streams `parsed` as JSON text in small, uneven pieces. */
function fakeClient(parsed: Record<string, unknown>) {
  const json = JSON.stringify(parsed);
  return { messages: { stream: () => ({
    async *[Symbol.asyncIterator]() {
      for (let at = 0; at < json.length; at += 7) {
        yield { type: "content_block_delta", delta: { type: "text_delta", text: json.slice(at, at + 7) } };
      }
    },
    finalMessage: async () => ({
      stop_reason: "end_turn", usage: { input_tokens: 1800, output_tokens: 1000 }, parsed_output: parsed,
    }),
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
  ...findScene("supermarket", "daily")!, level: findLevel("starter")!,
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

test("a reply is read field by field and segment by segment, however it is split", () => {
  const reply = JSON.stringify({
    title: "買\"蘋果\"", intro: "你們{走進}超市。",
    segments: [{ speaker: "cat", text: "[a]", word_ids: ["x"] }, { speaker: "you", text: "b", word_ids: [] }],
    word_notes: [{ id: "x", note: "n" }],
  });
  for (const size of [1, 3, 50, reply.length]) {
    const fields: Array<[string, string]> = [];
    const segments: unknown[] = [];
    const scan = createReplyScanner({ field: (k, v) => fields.push([k, v]), segment: raw => segments.push(raw) });
    for (let at = 0; at < reply.length; at += size) scan(reply.slice(at, at + size));
    assert.deepEqual(fields, [["title", "買\"蘋果\""], ["intro", "你們{走進}超市。"]], `size ${size}`);
    assert.deepEqual(segments.map(s => (s as { text: string }).text), ["[a]", "b"], `size ${size}`);
  }
});

test("the opening and each segment are passed on as written, the same as the finished story", async () => {
  const parts: StoryPart[] = [];
  const { story } = await createStoryModel(fakeClient(modelReply))(storyRequest("zh-Hant"), part => parts.push(part));
  assert.deepEqual(parts[0], { type: "opening", title: "t", intro: "i" });
  assert.deepEqual(parts.slice(1).map(p => p.type === "segment" && p.segment), story.segments);
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
    ...findScene("supermarket", "daily")!, level: findLevel("starter")!,
  });
  assert.match(prompt, /Place: Supermarket \(超市\)/);
  assert.match(prompt, /What is happening: Everyday \(日常\)/);
  assert.match(prompt, /です\/ます form only/);
  assert.match(prompt, /"id":"apple"/);
});

// --- handler -----------------------------------------------------------------

const balance = (available: number) => ({ available, reconciliationRequired: false }) as CreditBalance;

interface Options {
  available?: number; reply?: Story; writeFails?: Error; unknownIds?: string[];
  /** Fail only after the opening has been passed on. */
  failsMidway?: Error;
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
    write: async (request, onPart): Promise<StoryModelReply> => {
      written.push(request);
      if (options.writeFails) throw options.writeFails;
      const reply = options.reply ?? story("りんごを三つ買います。");
      onPart?.({ type: "opening", title: reply.title, intro: reply.intro });
      if (options.failsMidway) throw options.failsMidway;
      for (const segment of reply.segments) onPart?.({ type: "segment", segment });
      return { story: reply, usage: options.usage ?? { inputTokens: 1800, outputTokens: 1000 } };
    },
    record: async entry => { records.push(entry); },
    reportError: () => {},
  });
  return { handler, written, charges, records };
}

const write = (data: Record<string, unknown> = {}, accept = "application/json") =>
  new Request("https://tuji.test/api/assistant/story", {
    method: "POST", headers: { "content-type": "application/json", accept },
    body: JSON.stringify({
      requestId: randomUUID(), uiLanguage: "zh-Hant", learningDirection: "zh-ja", wordIds: ["apple"],
      sceneId: "supermarket", situationId: "daily", levelId: "starter", ...data,
    }),
  });

test("every place offers the same three situations: 日常, 工作, 閒聊", () => {
  for (const scene of STORY_SCENES) {
    assert.deepEqual(scene.situations.map(s => s.label["zh-Hant"]), ["日常", "工作", "閒聊"], scene.id);
  }
});

test("the offer lists the choices in the interface language beside the price range", async () => {
  const { handler } = setup({ available: 42 });
  const body = await (await handler(new Request("https://tuji.test/api/assistant/story?uiLanguage=en"), "offer")).json();
  assert.equal(body.minPoints, STORY_PRICING.minPoints);
  assert.equal(body.maxPoints, STORY_PRICING.maxPoints);
  assert.equal(body.available, 42);
  const market = body.scenes.find((s: { id: string }) => s.id === "supermarket");
  assert.equal(market.label, "Supermarket");
  assert.deepEqual(market.situations.map((s: { label: string }) => s.label), ["Everyday", "Work", "Small talk"]);
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
    { wordIds: ["saved:"] },
    { wordIds: ["saved:not a slug"] },
    { wordIds: ["atlas:not-a-uuid"] },
    { sceneId: "office", situationId: "shopping" },
    { sceneId: "station", situationId: "tickets" },
    { levelId: "expert" },
    { extra: true },
  ]) {
    const { handler, written, charges } = setup();
    assert.equal((await handler(write(data), "write")).status, 400, JSON.stringify(data));
    assert.equal(written.length, 0);
    assert.equal(charges.length, 0);
  }
});

test("a 收進 card goes to the model like any other picked item", async () => {
  // The fake dictionary spells an item as its own id; the story has to use both.
  const { handler, written } = setup({ reply: story("りんごを三つ買います。", "saved:cup-1a2b3c4d") });
  assert.equal((await handler(write({ wordIds: ["apple", "saved:cup-1a2b3c4d"] }), "write")).status, 200);
  assert.deepEqual(written[0].words.map(word => word.id), ["apple", "saved:cup-1a2b3c4d"]);
});

test("a 收進 card that does not resolve — taken down, withdrawn, a blocked author, never saved — never reaches the model", async () => {
  const card = "saved:cup-1a2b3c4d";
  const { handler, written } = setup({ unknownIds: [card] });
  assert.equal((await handler(write({ wordIds: ["apple", card] }), "write")).status, 400);
  assert.equal(written.length, 0);
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

// --- streamed ------------------------------------------------------------------

const streamed = (data: Record<string, unknown> = {}) => write(data, "application/x-ndjson");
async function lines(response: Response) {
  return (await response.text()).trim().split("\n").map(line => JSON.parse(line));
}

test("a streamed story sends its opening, each segment, then the whole story and its price", async () => {
  const { handler, charges } = setup();
  const response = await handler(streamed(), "write");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/x-ndjson");
  const sent = await lines(response);
  assert.deepEqual(sent.map(line => line.type), ["opening", "segment", "segment", "done"]);
  const done = sent[3];
  assert.equal(done.story.segments.length, 2);
  assert.equal(done.charged, 3);
  assert.equal(done.available, 97);
  assert.equal(charges.length, 1);
});

test("a streamed request still refuses bad items with a status, before anything is written", async () => {
  const { handler, written } = setup({ unknownIds: ["atlas:00000000-0000-4000-8000-000000000000"] });
  const response = await handler(streamed({ wordIds: ["apple", "atlas:00000000-0000-4000-8000-000000000000"] }), "write");
  assert.equal(response.status, 400);
  assert.equal(written.length, 0);
});

test("a model failure before the opening is a status; after it, an error line — neither is charged", async () => {
  const before = setup({ writeFails: new AssistantError("rate_limited") });
  assert.equal((await before.handler(streamed(), "write")).status, 429);
  assert.equal(before.charges.length, 0);

  const after = setup({ failsMidway: new AssistantError("assistant_unavailable") });
  const response = await after.handler(streamed(), "write");
  assert.equal(response.status, 200);
  const sent = await lines(response);
  assert.deepEqual(sent.map(line => line.type), ["opening", "error"]);
  assert.equal(sent[1].error, "assistant_unavailable");
  assert.equal(after.charges.length, 0);
});

test("a streamed story that leaves out a picked item is kept but not charged", async () => {
  const { handler, charges, records } = setup({ reply: story("こんにちは。") });
  const sent = await lines(await handler(streamed(), "write"));
  const done = sent[sent.length - 1];
  assert.equal(done.type, "done");
  assert.equal(done.charged, 0);
  assert.equal(charges.length, 0);
  assert.equal(records[0].inScope, false);
});
