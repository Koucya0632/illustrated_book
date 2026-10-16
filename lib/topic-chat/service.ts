// 主題對話's request handling: who may talk, what each action does, and what
// it costs. The store keeps the ordering rules (./store); the model writes
// (./model); this decides between them.
//
// Billing follows design §9.4 as proposed: an answer that gets a reply is the
// one paid step, priced by the tokens used between a floor and a ceiling like
// 問 AI, with translation, pattern, options and the example all inside that
// price. Openings, 簡單一點／換個問題／幫我表達 (two free between answers) and
// the review are free but rate-limited. A reply is charged only once it is
// saved and can be read again; a stop or a topic switch that the server sees
// first means it never lands and is never charged.

import { randomUUID } from "node:crypto";
import { CreditError, type CreditConfig } from "../credits/policy";
import type { CreditAccount, CreditBalance, CreditTransaction } from "../credits/wallet";
import { readLimitedJson, RequestBodyTooLargeError } from "../request-body";
import { usagePoints, type AssistantUsage } from "../assistant/pricing";
import type { AssistantUsageRecord } from "../assistant/usage";
import {
  assistInput, endInput, openingInput, replyInput, startInput, stopInput, switchTopicInput,
  TOPIC_CHAT_FREE_ASSISTS, TOPIC_CHAT_MAX_BODY_BYTES, TopicChatError,
  type AiMessageBody, type ChatMessage, type ChatOffer, type ChatState, type ChatSummary,
  type LearningDirection, type RequestKind, type TopicChatErrorCode, type UiLanguage, type UserMessageBody,
} from "./contracts";
import { ModelFailure, type TopicChatModel, type TopicMaterial, type TopicWord, type TranscriptLine, type TurnTask } from "./model";
import type { ChatRow, MessageRow, RequestRow, TopicChatStore } from "./store";

export const TOPIC_CHAT_PRICING = {
  version: "topic-chat-2026-10",
  minPoints: 1,
  maxPoints: 5,
} as const;

/** How many messages a state carries, and how many a turn's prompt sees. */
const STATE_MESSAGES = 200;
const PROMPT_LINES = 24;
const REVIEW_LINES = 80;
/** Topic words handed to the model per turn. */
const PROMPT_WORDS = 40;
const LIST_LIMIT = 30;

interface Wallet {
  readWallet(account: CreditAccount): Promise<CreditBalance>;
  transact<T>(account: CreditAccount, run: (scope: CreditTransaction) => Promise<T>): Promise<T>;
}

export interface TopicChatDependencies {
  currentUserId: () => Promise<string | null>;
  config: (userId: string) => CreditConfig;
  enabled: () => boolean;
  wallet: () => Wallet;
  store: () => TopicChatStore;
  model: () => TopicChatModel;
  /** The category with its words in this direction, or null when it cannot be a topic. */
  loadTopic: (topicId: string, uiLanguage: UiLanguage, direction: LearningDirection) => Promise<TopicMaterial | null>;
  /** Category names in the interface language, for chats listed or read. */
  topicNames: (uiLanguage: UiLanguage) => Promise<Map<string, string>>;
  /** "free": openings, assists and reviews. "reply": paid answers. Throws `rate_limited`. */
  rateLimit: (userId: string, bucket: "free" | "reply") => Promise<void>;
  record: (entry: AssistantUsageRecord) => Promise<void>;
  reportError: () => void;
  newId?: () => string;
}

export type TopicChatAction =
  | { action: "list" } | { action: "start" }
  | { action: "read"; chatId: string } | { action: "delete"; chatId: string }
  | { action: "topic" | "opening" | "reply" | "assist" | "stop" | "end"; chatId: string };

const headers = { "Cache-Control": "private, no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errorStatus(code: TopicChatErrorCode): number {
  switch (code) {
    case "invalid_topic_chat_request": return 400;
    case "chat_not_found": return 404;
    case "rate_limited": return 429;
    case "assistant_unavailable": return 503;
    default: return 409;
  }
}

function uiLanguageOf(request: Request): UiLanguage {
  const value = new URL(request.url).searchParams.get("uiLanguage");
  return value === "zh-Hans" || value === "ja" || value === "en" ? value : "zh-Hant";
}

function directionOf(request: Request): LearningDirection {
  return new URL(request.url).searchParams.get("learningDirection") === "zh-ja" ? "zh-ja" : "zh-en";
}

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id, kind: row.kind, topicId: row.topicId, topicVersion: row.topicVersion,
    createdAt: row.createdAt.toISOString(), [row.kind]: row.body,
  } as ChatMessage;
}

function latestAi(messages: MessageRow[], topicVersion: number): MessageRow | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.topicVersion !== topicVersion) return undefined;
    if (m.kind === "ai") return m;
  }
  return undefined;
}

/** Oldest first; topic dividers say where the topic changed. */
function transcript(messages: MessageRow[], limit: number): { lines: TranscriptLine[]; truncated: boolean } {
  const lines = messages.flatMap((m): TranscriptLine[] => {
    if (m.kind === "topic") return [{ speaker: "topic", name: String(m.body.name ?? "") }];
    if (m.kind === "user") {
      const body = m.body as unknown as UserMessageBody;
      return [{ speaker: "you", id: m.id, text: body.text, support: body.support ?? [] }];
    }
    const body = m.body as unknown as AiMessageBody;
    return [{ speaker: "moira", id: m.id, text: body.line.text }];
  });
  return { lines: lines.slice(-limit), truncated: lines.length > limit };
}

/** The words a turn may use: what the conversation already touched, then the rest of the topic. */
export function pickWords(words: TopicWord[], messages: MessageRow[], limit = PROMPT_WORDS): TopicWord[] {
  const recent = new Set<string>();
  for (const m of messages.slice(-12)) {
    if (m.kind !== "ai") continue;
    const body = m.body as unknown as AiMessageBody;
    for (const id of body.wordIds ?? []) recent.add(id);
    for (const k of body.keywords ?? []) if (k.wordId) recent.add(k.wordId);
  }
  const first = words.filter(word => recent.has(word.id));
  return [...first, ...words.filter(word => !recent.has(word.id))].slice(0, limit);
}

function recentPatterns(messages: MessageRow[]): string[] {
  const keys: string[] = [];
  for (const m of messages.slice(-8)) {
    const key = m.kind === "ai" ? (m.body as unknown as AiMessageBody).pattern?.key : undefined;
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

export function createTopicChatHandler(deps: TopicChatDependencies) {
  const newId = deps.newId ?? randomUUID;

  async function body<T>(request: Request, parse: (raw: unknown) => { success: true; data: T } | { success: false }): Promise<T> {
    let raw: unknown;
    try {
      raw = await readLimitedJson(request, TOPIC_CHAT_MAX_BODY_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError || error instanceof SyntaxError) {
        throw new TopicChatError("invalid_topic_chat_request");
      }
      throw error;
    }
    const parsed = parse(raw);
    if (!parsed.success) throw new TopicChatError("invalid_topic_chat_request");
    return parsed.data;
  }

  /** One request's view of the person: who, their wallet, and the chats they can reach. */
  async function session(userId: string) {
    const config = deps.config(userId);
    if (config.mode !== "live" || !deps.enabled()) throw new CreditError("credits_disabled");
    const account: CreditAccount = { userId, environment: config.environment };
    const wallet = deps.wallet();
    // Also the membership gate: a wallet that is not on 罐頭點數 throws `credits_not_enrolled`.
    const balance = await wallet.readWallet(account);
    return { userId, account, wallet, balance, store: deps.store() };
  }
  type Session = Awaited<ReturnType<typeof session>>;

  const offerOf = (available: number): ChatOffer =>
    ({ minPoints: TOPIC_CHAT_PRICING.minPoints, maxPoints: TOPIC_CHAT_PRICING.maxPoints, available });

  function summary(chat: ChatRow, names: Map<string, string>): ChatSummary {
    return {
      id: chat.id, learningDirection: chat.learningDirection, topicId: chat.topicId,
      topicName: names.get(chat.topicId) ?? chat.topicId, topicVersion: chat.topicVersion, status: chat.status,
      createdAt: chat.createdAt.toISOString(), updatedAt: chat.updatedAt.toISOString(), answers: chat.answers,
      ...(chat.review ? { review: chat.review } : {}),
    };
  }

  async function state(s: Session, chatId: string, uiLanguage: UiLanguage, available: number): Promise<ChatState> {
    const chat = await s.store.chat(s.userId, chatId);
    if (!chat) throw new TopicChatError("chat_not_found");
    const [messages, pending, assists, names] = await Promise.all([
      s.store.messages(chat.id, STATE_MESSAGES), s.store.pending(chat.id),
      s.store.assistsSinceAnswer(chat.id), deps.topicNames(uiLanguage),
    ]);
    return {
      chat: summary(chat, names),
      messages: messages.map(toMessage),
      ...(pending ? {
        pending: {
          requestId: pending.requestId, kind: pending.kind,
          ...(typeof pending.payload?.text === "string" ? { text: pending.payload.text } : {}),
        },
      } : {}),
      needsOpening: chat.status === "active" && !messages.some(m => m.kind === "ai" && m.topicVersion === chat.topicVersion),
      assistsLeft: Math.max(0, TOPIC_CHAT_FREE_ASSISTS - assists),
      offer: offerOf(available),
    };
  }

  async function record(s: Session, requestId: string, usage: AssistantUsage, charged: number, inScope: boolean) {
    try {
      await deps.record({
        account: s.account, requestId, feature: "chat", pricingVersion: TOPIC_CHAT_PRICING.version,
        inScope, usage, charged,
      });
    } catch {
      deps.reportError();
    }
  }

  /** Charges a committed reply what its tokens cost, never more than the person holds. */
  async function charge(s: Session, requestId: string, usage: AssistantUsage): Promise<{ charged: number; available: number }> {
    const points = Math.min(usagePoints(usage, TOPIC_CHAT_PRICING), s.balance.available);
    if (points <= 0) return { charged: 0, available: s.balance.available };
    try {
      const settled = await s.wallet.transact(s.account, async scope => {
        await scope.reserve(`topic-chat:${requestId}`, points);
        return scope.settle(`topic-chat:${requestId}`, "commit");
      });
      return { charged: points, available: settled.wallet.available };
    } catch (error) {
      // The reply is saved and was paid for upstream; losing a point to a race
      // beats withholding it. A retry of a request already charged lands here too.
      if (error instanceof CreditError && ["insufficient_credits", "idempotency_conflict"].includes(error.code)) {
        return { charged: 0, available: s.balance.available };
      }
      throw error;
    }
  }

  async function chatOrThrow(s: Session, chatId: string): Promise<ChatRow> {
    if (!UUID.test(chatId)) throw new TopicChatError("chat_not_found");
    const chat = await s.store.chat(s.userId, chatId);
    if (!chat) throw new TopicChatError("chat_not_found");
    return chat;
  }

  async function topicOrThrow(topicId: string, uiLanguage: UiLanguage, direction: LearningDirection) {
    const topic = await deps.loadTopic(topicId, uiLanguage, direction);
    if (!topic) throw new TopicChatError("topic_unavailable");
    return topic;
  }

  /**
   * Begins a generation, or reports what became of an earlier send of the
   * same request id: "done" when it already landed, an error when it was
   * overtaken. Throws `chat_busy` when something else is being written.
   */
  async function begin(s: Session, chat: ChatRow, requestId: string, kind: RequestKind,
    anchor: string | null, payload: Record<string, unknown> | null): Promise<"started" | RequestRow> {
    const begun = await s.store.begin({
      requestId, chatId: chat.id, kind, topicVersion: chat.topicVersion, anchorMessageId: anchor, payload,
    });
    if (begun.state === "busy") throw new TopicChatError("chat_busy");
    if (begun.state === "started") return "started";
    const earlier = begun.request;
    if (earlier.status === "committed" || earlier.status === "pending") return earlier;
    throw new TopicChatError("request_stale");
  }

  /**
   * Runs one turn (opening, reply or another question) after `begin`. Returns
   * whether it landed; a model failure marks the request failed and rethrows.
   */
  async function runTurn(s: Session, chat: ChatRow, requestId: string, uiLanguage: UiLanguage, task: TurnTask,
    extra: { userMessage?: UserMessageBody; billable: boolean }) {
    let generated;
    try {
      const topic = await topicOrThrow(chat.topicId, uiLanguage, chat.learningDirection);
      const messages = await s.store.messages(chat.id, PROMPT_LINES * 2);
      const { lines, truncated } = transcript(messages, PROMPT_LINES);
      const previous = latestAi(messages, chat.topicVersion);
      const switchedFrom = task.kind === "opening" ? previousTopicName(messages, chat.topicVersion) : undefined;
      generated = await deps.model().turn({
        uiLanguage, learningDirection: chat.learningDirection,
        topic: { ...topic, words: pickWords(topic.words, messages) },
        transcript: lines, truncated,
        ...(previous ? { previous: previous.body as unknown as AiMessageBody } : {}),
        recentPatterns: recentPatterns(messages),
        task: task.kind === "opening" && switchedFrom ? { kind: "opening", switchedFrom } : task,
      });
    } catch (error) {
      await s.store.fail(requestId);
      if (error instanceof ModelFailure) await record(s, requestId, error.usage, 0, false);
      throw error;
    }
    const landed = await s.store.commit({
      requestId, chatId: chat.id,
      messages: [
        ...(extra.userMessage ? [{ id: newId(), kind: "user" as const, body: { ...extra.userMessage } }] : []),
        { id: newId(), kind: "ai", body: { ...generated.value } },
      ],
    });
    let charged = 0, available = s.balance.available;
    if (landed && extra.billable) ({ charged, available } = await charge(s, requestId, generated.usage));
    await record(s, requestId, generated.usage, charged, landed && extra.billable);
    return { landed, charged, available };
  }

  function previousTopicName(messages: MessageRow[], topicVersion: number): string | undefined {
    const earlier = messages.filter(m => m.kind === "topic" && m.topicVersion < topicVersion);
    return earlier.length ? String(earlier[earlier.length - 1].body.name ?? "") || undefined : undefined;
  }

  /** The opening for the current topic; a failure leaves the topic in place and says why. */
  async function open(s: Session, chat: ChatRow, requestId: string, uiLanguage: UiLanguage): Promise<TopicChatErrorCode | undefined> {
    try {
      const begun = await begin(s, chat, requestId, "opening", null, null);
      if (begun !== "started") return undefined;
      await deps.rateLimit(s.userId, "free").catch(async error => {
        await s.store.fail(requestId);
        throw error;
      });
      await runTurn(s, chat, requestId, uiLanguage, { kind: "opening" }, { billable: false });
      return undefined;
    } catch (error) {
      if (error instanceof TopicChatError) return error.code;
      throw error;
    }
  }

  const actions = {
    async list(request: Request, s: Session) {
      const direction = directionOf(request);
      const [chats, names] = await Promise.all([
        s.store.listChats(s.userId, direction, LIST_LIMIT), deps.topicNames(uiLanguageOf(request)),
      ]);
      return Response.json({
        chats: chats.map(chat => summary(chat, names)),
        active: chats.find(chat => chat.status === "active")?.id ?? null,
        offer: offerOf(s.balance.available),
      }, { headers });
    },

    async start(request: Request, s: Session) {
      const input = await body(request, raw => startInput.safeParse(raw));
      const existing = await s.store.chatCreatedBy(s.userId, input.requestId);
      const topic = existing ? null : await topicOrThrow(input.topicId, input.uiLanguage, input.learningDirection);
      const chat = existing ?? await s.store.createChat({
        id: newId(), userId: s.userId, direction: input.learningDirection, topicId: input.topicId,
        requestId: input.requestId, divider: { id: newId(), kind: "topic", body: { name: topic!.name } },
      });
      const openingError = await open(s, chat, input.requestId, input.uiLanguage);
      const result = await state(s, chat.id, input.uiLanguage, s.balance.available);
      return Response.json({ ...result, ...(openingError ? { openingError } : {}) }, { headers });
    },

    async read(request: Request, s: Session, chatId: string) {
      await chatOrThrow(s, chatId);
      return Response.json(await state(s, chatId, uiLanguageOf(request), s.balance.available), { headers });
    },

    async delete(_request: Request, s: Session, chatId: string) {
      if (!UUID.test(chatId) || !await s.store.deleteChat(s.userId, chatId)) throw new TopicChatError("chat_not_found");
      return Response.json({ ok: true }, { headers });
    },

    async topic(request: Request, s: Session, chatId: string) {
      const input = await body(request, raw => switchTopicInput.safeParse(raw));
      let chat = await chatOrThrow(s, chatId);
      if (chat.status !== "active") throw new TopicChatError("chat_ended");
      // Picking the topic already on screen is not a new opening.
      if (chat.topicId !== input.topicId) {
        const topic = await topicOrThrow(input.topicId, input.uiLanguage, chat.learningDirection);
        chat = (await s.store.switchTopic({
          userId: s.userId, chatId, topicId: input.topicId, requestId: input.requestId,
          divider: { id: newId(), kind: "topic", body: { name: topic.name } },
        }))!;
      }
      const result = await state(s, chatId, input.uiLanguage, s.balance.available);
      const openingError = result.needsOpening ? await open(s, chat, input.requestId, input.uiLanguage) : undefined;
      const after = result.needsOpening ? await state(s, chatId, input.uiLanguage, s.balance.available) : result;
      return Response.json({ ...after, ...(openingError ? { openingError } : {}) }, { headers });
    },

    async opening(request: Request, s: Session, chatId: string) {
      const input = await body(request, raw => openingInput.safeParse(raw));
      const chat = await chatOrThrow(s, chatId);
      if (chat.status !== "active") throw new TopicChatError("chat_ended");
      const before = await state(s, chatId, input.uiLanguage, s.balance.available);
      if (!before.needsOpening) return Response.json(before, { headers });
      const openingError = await open(s, chat, input.requestId, input.uiLanguage);
      const after = await state(s, chatId, input.uiLanguage, s.balance.available);
      return Response.json({ ...after, ...(openingError ? { openingError } : {}) }, { headers });
    },

    async reply(request: Request, s: Session, chatId: string) {
      const input = await body(request, raw => replyInput.safeParse(raw));
      const chat = await chatOrThrow(s, chatId);
      if (chat.status !== "active") throw new TopicChatError("chat_ended");
      const known = await s.store.request(chatId, input.requestId);
      if (!known || known.status !== "committed") {
        if (s.balance.reconciliationRequired) throw new CreditError("credits_reconciliation_required");
        // The ceiling: a reply must never cost more than the person held when they sent it.
        if (s.balance.available < TOPIC_CHAT_PRICING.maxPoints) throw new CreditError("insufficient_credits");
        const latest = latestAi(await s.store.messages(chatId, PROMPT_LINES), chat.topicVersion);
        if (latest?.id !== input.replyTo) throw new TopicChatError("message_outdated");
      }
      const begun = await begin(s, chat, input.requestId, "reply", input.replyTo, { text: input.text, support: input.support });
      let charged = 0, available = s.balance.available;
      if (begun === "started") {
        await deps.rateLimit(s.userId, "reply").catch(async error => {
          await s.store.fail(input.requestId);
          throw error;
        });
        ({ charged, available } = await runTurn(s, chat, input.requestId, input.uiLanguage,
          { kind: "reply", answer: input.text, support: input.support },
          { userMessage: { text: input.text, support: input.support }, billable: true }));
      }
      return Response.json({ ...await state(s, chatId, input.uiLanguage, available), charged }, { headers });
    },

    async assist(request: Request, s: Session, chatId: string) {
      const input = await body(request, raw => assistInput.safeParse(raw));
      const chat = await chatOrThrow(s, chatId);
      if (chat.status !== "active") throw new TopicChatError("chat_ended");
      const known = await s.store.request(chatId, input.requestId);
      if (known?.status === "committed") {
        const result = await state(s, chatId, input.uiLanguage, s.balance.available);
        return Response.json({ ...result, ...(known.result ?? {}) }, { headers });
      }
      const messages = await s.store.messages(chatId, PROMPT_LINES * 2);
      const anchor = latestAi(messages, chat.topicVersion);
      if (!anchor || anchor.id !== input.messageId) throw new TopicChatError("message_outdated");
      const turn = anchor.body as unknown as AiMessageBody;
      if (input.kind === "simplify" && turn.simpler) {
        return Response.json(await state(s, chatId, input.uiLanguage, s.balance.available), { headers });
      }
      if (await s.store.assistsSinceAnswer(chatId) >= TOPIC_CHAT_FREE_ASSISTS) throw new TopicChatError("assist_limit");
      const begun = await begin(s, chat, input.requestId, input.kind, anchor.id,
        input.kind === "express" ? { text: input.text } : null);
      if (begun !== "started") {
        return Response.json({ ...await state(s, chatId, input.uiLanguage, s.balance.available), ...(begun.result ?? {}) }, { headers });
      }
      await deps.rateLimit(s.userId, "free").catch(async error => {
        await s.store.fail(input.requestId);
        throw error;
      });

      if (input.kind === "another") {
        await runTurn(s, chat, input.requestId, input.uiLanguage, { kind: "another" }, { billable: false });
        return Response.json(await state(s, chatId, input.uiLanguage, s.balance.available), { headers });
      }

      const topic = await topicOrThrow(chat.topicId, input.uiLanguage, chat.learningDirection);
      const { lines } = transcript(messages, PROMPT_LINES);
      const base = {
        uiLanguage: input.uiLanguage, learningDirection: chat.learningDirection,
        topic: { ...topic, words: pickWords(topic.words, messages) }, transcript: lines, turn,
      };
      let usage: AssistantUsage, commit;
      try {
        if (input.kind === "simplify") {
          const generated = await deps.model().simplify(base);
          usage = generated.usage;
          commit = { mergeIntoAnchor: { simpler: generated.value } };
        } else {
          const generated = await deps.model().express({ ...base, idea: input.text });
          usage = generated.usage;
          commit = { result: { express: generated.value } };
        }
      } catch (error) {
        await s.store.fail(input.requestId);
        if (error instanceof ModelFailure) await record(s, input.requestId, error.usage, 0, false);
        throw error;
      }
      const landed = await s.store.commit({ requestId: input.requestId, chatId, messages: [], ...commit });
      await record(s, input.requestId, usage, 0, false);
      if (!landed) throw new TopicChatError("message_outdated");
      return Response.json({
        ...await state(s, chatId, input.uiLanguage, s.balance.available), ...(commit.result ?? {}),
      }, { headers });
    },

    async stop(request: Request, s: Session, chatId: string) {
      const input = await body(request, raw => stopInput.safeParse(raw));
      await chatOrThrow(s, chatId);
      const stopped = await s.store.stop(chatId, input.requestId);
      return Response.json({ stopped }, { headers });
    },

    async end(request: Request, s: Session, chatId: string) {
      const input = await body(request, raw => endInput.safeParse(raw));
      await chatOrThrow(s, chatId);
      const chat = (await s.store.endChat(s.userId, chatId))!;
      let reviewError: TopicChatErrorCode | undefined;
      // No answer, no review: there is nothing the person did to look back on.
      if (input.review && chat.answers > 0 && !chat.review) {
        try {
          const begun = await begin(s, chat, input.requestId, "review", null, null);
          if (begun === "started") {
            await deps.rateLimit(s.userId, "free").catch(async error => {
              await s.store.fail(input.requestId);
              throw error;
            });
            const messages = await s.store.messages(chatId, STATE_MESSAGES);
            const names = [...new Set(messages.filter(m => m.kind === "topic").map(m => String(m.body.name ?? "")))];
            const { lines } = transcript(messages, REVIEW_LINES);
            let generated;
            try {
              generated = await deps.model().review({
                uiLanguage: input.uiLanguage, learningDirection: chat.learningDirection, topics: names, transcript: lines,
              });
            } catch (error) {
              await s.store.fail(input.requestId);
              if (error instanceof ModelFailure) await record(s, input.requestId, error.usage, 0, false);
              throw error;
            }
            const topicIds = [...new Map(messages.filter(m => m.kind === "topic")
              .map(m => [m.topicId, String(m.body.name ?? "")])).entries()];
            await s.store.commit({
              requestId: input.requestId, chatId, messages: [],
              review: { topics: topicIds.map(([id, name]) => ({ id, name })), ...generated.value },
            });
            await record(s, input.requestId, generated.usage, 0, false);
          }
        } catch (error) {
          if (!(error instanceof TopicChatError)) throw error;
          reviewError = error.code;
        }
      }
      const result = await state(s, chatId, input.uiLanguage, s.balance.available);
      return Response.json({ ...result, ...(reviewError ? { reviewError } : {}) }, { headers });
    },
  };

  return async (request: Request, route: TopicChatAction): Promise<Response> => {
    try {
      const userId = await deps.currentUserId();
      if (!userId) return Response.json({ error: "unauthorized" }, { status: 401, headers });
      if (request.method !== "GET") {
        const origin = request.headers.get("origin");
        if (request.headers.get("sec-fetch-site") === "cross-site" ||
            (origin !== null && origin !== new URL(request.url).origin)) {
          return Response.json({ error: "forbidden" }, { status: 403, headers });
        }
      }
      const s = await session(userId);
      switch (route.action) {
        case "list": return await actions.list(request, s);
        case "start": return await actions.start(request, s);
        default: return await actions[route.action](request, s, route.chatId);
      }
    } catch (error) {
      if (error instanceof TopicChatError) {
        const retry: Record<string, string> = error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : {};
        return Response.json({ error: error.code }, { status: errorStatus(error.code), headers: { ...headers, ...retry } });
      }
      if (error instanceof CreditError) {
        const status = error.code === "credits_disabled" ? 404 :
          ["credits_not_enrolled", "benefit_ineligible"].includes(error.code) ? 403 :
            error.code === "insufficient_credits" ? 409 : 503;
        return Response.json({ error: error.code, minPoints: TOPIC_CHAT_PRICING.minPoints, maxPoints: TOPIC_CHAT_PRICING.maxPoints },
          { status, headers });
      }
      deps.reportError();
      return Response.json({ error: "assistant_unavailable" }, { status: 503, headers });
    }
  };
}
