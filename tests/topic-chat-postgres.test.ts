import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import { creditConfig } from "../lib/credits/policy";
import { CreditError } from "../lib/credits/policy";
import type { CreditBalance, CreditTransaction } from "../lib/credits/wallet";
import { migrateCreditSchema } from "../lib/credits/schema";
import { migrateAssistantSchema } from "../lib/assistant/schema";
import type { AssistantUsageRecord } from "../lib/assistant/usage";
import type { AiMessageBody, ChatState } from "../lib/topic-chat/contracts";
import { ModelFailure, type TopicChatModel, type TurnRequest } from "../lib/topic-chat/model";
import { TOPIC_CHAT_TABLES, migrateTopicChatSchema } from "../lib/topic-chat/schema";
import { createTopicChatHandler, type TopicChatAction } from "../lib/topic-chat/service";
import { createTopicChatStore } from "../lib/topic-chat/store";

const databaseUrl = process.env.CREDIT_TEST_DATABASE_URL;

const usage = { inputTokens: 3000, outputTokens: 400 };

function turn(text: string, intent: AiMessageBody["intent"] = "share"): AiMessageBody {
  return {
    intent, line: { text, translation: "t" }, awaitsAnswer: true,
    pattern: { key: "want_to_go", template: "＿＿に行きたいです。" },
    options: [], keywords: [], wordIds: [],
  };
}

/** A model whose next call of a kind can be held until the test lets it go. */
function controllableModel() {
  const calls: { kind: string; request: unknown }[] = [];
  const holds = new Map<string, Promise<void>>();
  const failures = new Set<string>();
  const gate = async (kind: string) => {
    const hold = holds.get(kind);
    if (hold) { holds.delete(kind); await hold; }
    if (failures.has(kind)) { failures.delete(kind); throw new ModelFailure("assistant_unavailable", usage); }
  };
  const model: TopicChatModel = {
    async turn(request: TurnRequest) {
      calls.push({ kind: request.task.kind, request });
      await gate(request.task.kind);
      const text = request.task.kind === "reply" ? `re:${request.task.answer}` : `${request.task.kind}:${request.topic.id}`;
      return { value: turn(text, request.task.kind === "opening" ? "opening" : "share"), usage };
    },
    async simplify(request) {
      calls.push({ kind: "simplify", request });
      await gate("simplify");
      return { value: { note: "easier", options: [] }, usage };
    },
    async express(request) {
      calls.push({ kind: "express", request });
      await gate("express");
      return { value: { text: `ex:${request.idea}` }, usage };
    },
    async review(request) {
      calls.push({ kind: "review", request });
      await gate("review");
      const you = request.transcript.find(line => line.speaker === "you");
      return {
        value: {
          phrases: you && you.speaker === "you" ? [{ text: { text: you.text }, source: "you" as const, messageId: you.id }] : [],
          nextIdea: "next",
        },
        usage,
      };
    },
  };
  return {
    model, calls,
    hold(kind: string) {
      let release!: () => void;
      holds.set(kind, new Promise<void>(resolve => { release = resolve; }));
      return () => release();
    },
    failNext(kind: string) { failures.add(kind); },
  };
}

function fakeWallet(start: number) {
  let available = start;
  const charges = new Map<string, number>();
  const balance = (): CreditBalance => ({ available, reconciliationRequired: false } as CreditBalance);
  return {
    charges,
    setAvailable(value: number) { available = value; },
    wallet: {
      readWallet: async () => balance(),
      transact: async <T>(_account: unknown, run: (scope: CreditTransaction) => Promise<T>) => {
        let pendingKey = "", pendingAmount = 0;
        const scope = {
          reserve: async (key: string, amount: number) => {
            if (charges.has(key)) throw new CreditError("idempotency_conflict");
            pendingKey = key; pendingAmount = amount;
            return { operationKey: key, amount, state: "reserved" };
          },
          settle: async () => {
            charges.set(pendingKey, pendingAmount);
            available -= pendingAmount;
            return { operationKey: pendingKey, amount: pendingAmount, state: "committed", wallet: balance() };
          },
        } as unknown as CreditTransaction;
        return run(scope);
      },
    },
  };
}

test("topic chat against isolated PostgreSQL", { skip: !databaseUrl }, async t => {
  // Never substitute DATABASE_URL.
  const url = new URL(databaseUrl!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/tuji_credits_test");
  const sql = postgres(databaseUrl!, { max: 5, onnotice: () => {} });
  try {
    await sql`CREATE SCHEMA IF NOT EXISTS auth`;
    await sql`CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY)`;
    await migrateCreditSchema(sql);
    await migrateAssistantSchema(sql);
    await migrateTopicChatSchema(sql);
    // Both migrations must be safe to run a second time.
    await migrateAssistantSchema(sql);
    await migrateTopicChatSchema(sql);

    const tables = await sql`SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY(${[...TOPIC_CHAT_TABLES]})`;
    assert.equal(tables.length, TOPIC_CHAT_TABLES.length);
    assert.ok(tables.every(row => row.relrowsecurity));

    /** A fresh person, a fresh model and wallet, and a way to call the API as them. */
    async function harness(points = 100) {
      const userId = randomUUID();
      await sql`INSERT INTO auth.users (id) VALUES (${userId})`;
      const control = controllableModel();
      const wallet = fakeWallet(points);
      const records: AssistantUsageRecord[] = [];
      const handle = createTopicChatHandler({
        currentUserId: async () => userId,
        config: () => creditConfig({ AI_CREDITS_MODE: "live", AI_CREDITS_ENVIRONMENT: "sandbox" }),
        enabled: () => true,
        wallet: () => wallet.wallet,
        store: () => createTopicChatStore(sql),
        model: () => control.model,
        loadTopic: async topicId => ["street", "zoo"].includes(topicId)
          ? { id: topicId, name: `${topicId}-name`, nameEn: topicId, words: [{ id: `${topicId}-1`, word: "駅", meaning: "車站" }] }
          : null,
        topicNames: async () => new Map([["street", "街上"], ["zoo", "動物"]]),
        rateLimit: async () => {},
        record: async entry => { records.push(entry); },
        reportError: () => {},
      });
      const call = async (method: string, path: string, route: TopicChatAction, body?: unknown) => {
        const response = await handle(new Request(`http://localhost${path}`, {
          method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
        }), route);
        return { status: response.status, json: await response.json() as ChatState & Record<string, unknown> };
      };
      const start = (topicId = "street", requestId = randomUUID()) => call("POST", "/api/topic-chat", { action: "start" },
        { requestId, uiLanguage: "zh-Hant", learningDirection: "zh-ja", topicId });
      const post = (chatId: string, action: "topic" | "opening" | "reply" | "assist" | "stop" | "end", body: unknown) =>
        call("POST", `/api/topic-chat/${chatId}/${action}`, { action, chatId }, body);
      const read = (chatId: string) => call("GET", `/api/topic-chat/${chatId}`, { action: "read", chatId });
      const lastAi = (state: ChatState) => [...state.messages].reverse().find(m => m.kind === "ai")!;
      const reply = (state: ChatState, text: string, requestId = randomUUID()) => post(state.chat.id, "reply",
        { requestId, uiLanguage: "zh-Hant", text, replyTo: lastAi(state).id });
      return { userId, control, wallet, records, call, start, post, read, reply, lastAi };
    }

    await t.test("a new chat opens itself; a resend does not open it twice", async () => {
      const h = await harness();
      const requestId = randomUUID();
      const first = await h.start("street", requestId);
      assert.equal(first.status, 200);
      assert.deepEqual(first.json.messages.map(m => m.kind), ["topic", "ai"]);
      assert.equal(first.json.messages[1].ai!.line.text, "opening:street");
      assert.equal(first.json.needsOpening, false);
      assert.equal(first.json.chat.topicName, "街上");
      const again = await h.start("street", requestId);
      assert.equal(again.json.chat.id, first.json.chat.id);
      assert.equal(again.json.messages.length, 2);
      assert.equal(h.control.calls.filter(c => c.kind === "opening").length, 1);
      // Openings are free.
      assert.equal(h.wallet.charges.size, 0);
    });

    await t.test("an answer and its reply land together and are charged once, however often it is resent", async () => {
      const h = await harness();
      const chat = (await h.start()).json;
      const requestId = randomUUID();
      const sent = await h.reply(chat, "コンビニに行きたいです。", requestId);
      assert.equal(sent.status, 200);
      assert.deepEqual(sent.json.messages.map(m => m.kind), ["topic", "ai", "user", "ai"]);
      assert.equal(sent.json.messages[3].ai!.line.text, "re:コンビニに行きたいです。");
      assert.ok((sent.json.charged as number) >= 1);
      assert.equal(sent.json.chat.answers, 1);
      // The network dropped the answer; the app sends the same request twice more.
      for (let i = 0; i < 2; i++) {
        const resent = await h.post(chat.chat.id, "reply",
          { requestId, uiLanguage: "zh-Hant", text: "コンビニに行きたいです。", replyTo: h.lastAi(chat).id });
        assert.equal(resent.status, 200);
        assert.equal(resent.json.messages.length, 4);
        assert.equal(resent.json.charged, 0);
        // The conversation's total counts the reply once.
        assert.equal(resent.json.chat.spent, sent.json.charged);
      }
      assert.equal(h.wallet.charges.size, 1);
      assert.equal(h.control.calls.filter(c => c.kind === "reply").length, 1);
    });

    await t.test("an answer to a turn that is no longer the latest is refused", async () => {
      const h = await harness();
      const chat = (await h.start()).json;
      await h.reply(chat, "公園。");
      const stale = await h.reply(chat, "駅。");
      assert.equal(stale.status, 409);
      assert.equal(stale.json.error, "message_outdated");
    });

    await t.test("a second answer while one is being written is refused by the server", async () => {
      const h = await harness();
      const chat = (await h.start()).json;
      const release = h.control.hold("reply");
      const first = h.reply(chat, "一");
      await new Promise(resolve => setTimeout(resolve, 50));
      const second = await h.reply(chat, "二");
      assert.equal(second.status, 409);
      assert.equal(second.json.error, "chat_busy");
      // Reading the chat meanwhile shows the answer waiting.
      const waiting = await h.read(chat.chat.id);
      assert.equal(waiting.json.pending?.kind, "reply");
      assert.equal(waiting.json.pending?.text, "一");
      release();
      assert.equal((await first).status, 200);
    });

    await t.test("a stop the server sees first means the reply never lands and is never charged; it can be retried", async () => {
      const h = await harness();
      const chat = (await h.start()).json;
      const requestId = randomUUID();
      const release = h.control.hold("reply");
      const sending = h.reply(chat, "パン", requestId);
      await new Promise(resolve => setTimeout(resolve, 50));
      const stopped = await h.post(chat.chat.id, "stop", { requestId });
      assert.equal(stopped.json.stopped, true);
      release();
      const result = await sending;
      assert.equal(result.status, 200);
      assert.equal(result.json.messages.length, 2);
      assert.equal(result.json.charged, 0);
      assert.equal(result.json.chat.spent, 0);
      assert.equal(h.wallet.charges.size, 0);
      // The tokens were still spent: one usage row, nothing charged.
      assert.deepEqual(h.records.filter(r => r.requestId === requestId).map(r => r.charged), [0]);
      // Retrying the stopped answer under the same id works.
      const retried = await h.reply(chat, "パン", requestId);
      assert.equal(retried.json.messages.length, 4);
      assert.equal(h.wallet.charges.size, 1);
      // A stop after it landed changes nothing.
      assert.equal((await h.post(chat.chat.id, "stop", { requestId })).json.stopped, false);
    });

    await t.test("switching topic while a reply is written keeps that reply out of the new topic", async () => {
      const h = await harness();
      const chat = (await h.start()).json;
      const release = h.control.hold("reply");
      const sending = h.reply(chat, "本屋");
      await new Promise(resolve => setTimeout(resolve, 50));
      const switched = await h.post(chat.chat.id, "topic", { requestId: randomUUID(), uiLanguage: "zh-Hant", topicId: "zoo" });
      assert.equal(switched.status, 200);
      assert.equal(switched.json.chat.topicId, "zoo");
      assert.equal(switched.json.chat.topicVersion, 2);
      release();
      await sending;
      const after = (await h.read(chat.chat.id)).json;
      assert.deepEqual(after.messages.map(m => m.kind), ["topic", "ai", "topic", "ai"]);
      assert.equal(after.messages[3].ai!.line.text, "opening:zoo");
      assert.equal(h.wallet.charges.size, 0);
      // The opening of the new topic knew where the chat came from.
      const opening = h.control.calls.filter(c => c.kind === "opening").at(-1)!.request as TurnRequest;
      assert.deepEqual(opening.task, { kind: "opening", switchedFrom: "street-name" });
    });

    await t.test("picking the topic already on screen does not open it again", async () => {
      const h = await harness();
      const chat = (await h.start()).json;
      const same = await h.post(chat.chat.id, "topic", { requestId: randomUUID(), uiLanguage: "zh-Hant", topicId: "street" });
      assert.equal(same.json.messages.length, 2);
      assert.equal(same.json.chat.topicVersion, 1);
    });

    await t.test("a switch whose opening fails keeps the new topic, and a retry opens it exactly once", async () => {
      const h = await harness();
      const chat = (await h.start()).json;
      h.control.failNext("opening");
      const switched = await h.post(chat.chat.id, "topic", { requestId: randomUUID(), uiLanguage: "zh-Hant", topicId: "zoo" });
      assert.equal(switched.status, 200);
      assert.equal(switched.json.openingError, "assistant_unavailable");
      assert.equal(switched.json.chat.topicId, "zoo");
      assert.equal(switched.json.needsOpening, true);
      const retry = randomUUID();
      const opened = await h.post(chat.chat.id, "opening", { requestId: retry, uiLanguage: "zh-Hant" });
      assert.equal(opened.json.needsOpening, false);
      const again = await h.post(chat.chat.id, "opening", { requestId: randomUUID(), uiLanguage: "zh-Hant" });
      assert.equal(again.json.messages.filter(m => m.kind === "ai").length, 2);
    });

    await t.test("a failed reply leaves no answer behind and can be retried under the same id", async () => {
      const h = await harness();
      const chat = (await h.start()).json;
      h.control.failNext("reply");
      const requestId = randomUUID();
      const failed = await h.reply(chat, "水", requestId);
      assert.equal(failed.status, 503);
      assert.equal((await h.read(chat.chat.id)).json.messages.length, 2);
      const retried = await h.reply(chat, "水", requestId);
      assert.equal(retried.json.messages.length, 4);
    });

    await t.test("two free assists between answers; 換個問題 does not reset them; an answer does", async () => {
      const h = await harness();
      let chat = (await h.start()).json;
      assert.equal(chat.assistsLeft, 2);
      const express = await h.post(chat.chat.id, "assist",
        { kind: "express", requestId: randomUUID(), uiLanguage: "zh-Hant", messageId: h.lastAi(chat).id, text: "我想買水" });
      assert.deepEqual(express.json.express, { text: "ex:我想買水" });
      // 幫我表達 never becomes a chat message.
      assert.equal(express.json.messages.length, 2);
      assert.equal(express.json.assistsLeft, 1);
      chat = (await h.post(chat.chat.id, "assist",
        { kind: "another", requestId: randomUUID(), uiLanguage: "zh-Hant", messageId: h.lastAi(chat).id })).json;
      assert.equal(chat.messages.length, 3);
      assert.equal(chat.assistsLeft, 0);
      const over = await h.post(chat.chat.id, "assist",
        { kind: "simplify", requestId: randomUUID(), uiLanguage: "zh-Hant", messageId: h.lastAi(chat).id });
      assert.equal(over.status, 409);
      assert.equal(over.json.error, "assist_limit");
      chat = (await h.reply(chat, "はい")).json;
      assert.equal(chat.assistsLeft, 2);
      const simpler = await h.post(chat.chat.id, "assist",
        { kind: "simplify", requestId: randomUUID(), uiLanguage: "zh-Hant", messageId: h.lastAi(chat).id });
      assert.deepEqual(h.lastAi(simpler.json).ai!.simpler, { note: "easier", options: [] });
      assert.equal(h.wallet.charges.size, 1);
    });

    await t.test("an assist on an older turn is refused", async () => {
      const h = await harness();
      const chat = (await h.start()).json;
      await h.reply(chat, "はい");
      const old = await h.post(chat.chat.id, "assist",
        { kind: "simplify", requestId: randomUUID(), uiLanguage: "zh-Hant", messageId: h.lastAi(chat).id });
      assert.equal(old.json.error, "message_outdated");
    });

    await t.test("ending with no answer makes no review; with one, a review of only that one", async () => {
      const h = await harness();
      const empty = (await h.start()).json;
      const ended = await h.post(empty.chat.id, "end", { requestId: randomUUID(), uiLanguage: "zh-Hant", review: true });
      assert.equal(ended.json.chat.status, "ended");
      assert.equal(ended.json.chat.review, undefined);
      assert.equal(h.control.calls.filter(c => c.kind === "review").length, 0);

      const chat = (await h.start()).json;
      const answered = (await h.reply(chat, "公園に行きたいです。")).json;
      const reviewed = await h.post(chat.chat.id, "end", { requestId: randomUUID(), uiLanguage: "zh-Hant", review: true });
      const review = reviewed.json.chat.review!;
      assert.deepEqual(review.topics, [{ id: "street", name: "street-name" }]);
      assert.equal(review.phrases.length, 1);
      assert.equal(review.phrases[0].messageId, answered.messages[2].id);
      // An ended chat takes no more answers.
      assert.equal((await h.reply(answered, "まだ")).json.error, "chat_ended");
    });

    await t.test("a new chat ends the one being continued", async () => {
      const h = await harness();
      const first = (await h.start()).json;
      const second = (await h.start("zoo")).json;
      const list = await h.call("GET", "/api/topic-chat?learningDirection=zh-ja", { action: "list" });
      const chats = list.json.chats as unknown as { id: string; status: string }[];
      assert.equal(list.json.active, second.chat.id);
      assert.equal(chats.find(c => c.id === first.chat.id)!.status, "ended");
    });

    await t.test("deleting a chat mid-reply: the reply does not bring it back", async () => {
      const h = await harness();
      const chat = (await h.start()).json;
      const release = h.control.hold("reply");
      const sending = h.reply(chat, "猫");
      await new Promise(resolve => setTimeout(resolve, 50));
      const deleted = await h.call("DELETE", `/api/topic-chat/${chat.chat.id}`, { action: "delete", chatId: chat.chat.id });
      assert.equal(deleted.status, 200);
      release();
      const result = await sending;
      assert.equal(result.status, 404);
      const rows = await sql`SELECT count(*)::int AS n FROM topic_chat_messages WHERE chat_id = ${chat.chat.id}`;
      assert.equal(rows[0].n, 0);
      assert.equal(h.wallet.charges.size, 0);
    });

    await t.test("another person's chat cannot be read", async () => {
      const h = await harness();
      const other = await harness();
      const chat = (await other.start()).json;
      const read = await h.read(chat.chat.id);
      assert.equal(read.status, 404);
    });

    await t.test("a balance below the ceiling is told before anything is written", async () => {
      const h = await harness(3);
      const chat = (await h.start()).json;
      const refused = await h.reply(chat, "はい");
      assert.equal(refused.status, 409);
      assert.equal(refused.json.error, "insufficient_credits");
      assert.equal(h.control.calls.filter(c => c.kind === "reply").length, 0);
    });

    await t.test("an unknown topic is refused before a chat exists", async () => {
      const h = await harness();
      const refused = await h.start("nowhere");
      assert.equal(refused.json.error, "topic_unavailable");
      const rows = await sql`SELECT count(*)::int AS n FROM topic_chats WHERE user_id = ${h.userId}`;
      assert.equal(rows[0].n, 0);
    });
  } finally {
    await sql.end();
  }
});
