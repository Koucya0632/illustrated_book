// 圖鑑主題對話's wire contract — /api/topic-chat.
//
// The person picks a catalogue category as the topic; Moira opens, takes up
// what they answer, and shows a sentence they can copy with one part swapped.
// See docs/ATLAS_AI_CONVERSATION_DESIGN.md (in the workspace root) for the
// product rules this implements.
//
// Every generation carries a client-made request id. Sending the same id again
// never makes a second message or a second charge: it answers with what the
// first send produced, or says it is still being written.

import { z } from "zod";
import type { FuriganaSegment } from "../kana";

export const TOPIC_CHAT_MAX_BODY_BYTES = 4096;
/** An answer is a few sentences; 幫我表達's draft a few more. */
export const TOPIC_CHAT_MAX_ANSWER = 300;
export const TOPIC_CHAT_MAX_EXPRESS = 300;
/** Free 幫我表達／簡單一點／換個問題 between two answers (design §9.4). */
export const TOPIC_CHAT_FREE_ASSISTS = 2;

const requestId = z.string().uuid().transform(value => value.toLowerCase());
const uiLanguage = z.enum(["zh-Hant", "zh-Hans", "ja", "en"]);
const learningDirection = z.enum(["zh-en", "zh-ja"]);
const topicId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/);
const messageId = z.string().uuid().transform(value => value.toLowerCase());

export type UiLanguage = z.infer<typeof uiLanguage>;
export type LearningDirection = z.infer<typeof learningDirection>;

/** The supports the app lets a person open before answering. Recorded, never judged. */
export const SUPPORT_KINDS = ["hint", "example", "express", "option", "simplify"] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number];

export const startInput = z.object({
  requestId, uiLanguage, learningDirection, topicId,
}).strict();

export const switchTopicInput = z.object({ requestId, uiLanguage, topicId }).strict();

export const openingInput = z.object({ requestId, uiLanguage }).strict();

export const replyInput = z.object({
  requestId,
  uiLanguage,
  text: z.string().trim().min(1).max(TOPIC_CHAT_MAX_ANSWER),
  /** The AI message being answered; a reply to an older one is refused. */
  replyTo: messageId,
  support: z.array(z.enum(SUPPORT_KINDS)).max(SUPPORT_KINDS.length).default([])
    .transform(kinds => [...new Set(kinds)]),
}).strict();

export const assistInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("express"), requestId, uiLanguage, messageId,
    /** What the person wants to say, in whatever language they can. */
    text: z.string().trim().min(1).max(TOPIC_CHAT_MAX_EXPRESS),
  }).strict(),
  z.object({ kind: z.literal("simplify"), requestId, uiLanguage, messageId }).strict(),
  z.object({ kind: z.literal("another"), requestId, uiLanguage, messageId }).strict(),
]);

export const stopInput = z.object({ requestId }).strict();

export const endInput = z.object({
  requestId, uiLanguage,
  /** False for 「結束」 alone; true for 「結束並回顧」. */
  review: z.boolean(),
}).strict();

export type StartInput = z.infer<typeof startInput>;
export type SwitchTopicInput = z.infer<typeof switchTopicInput>;
export type ReplyInput = z.infer<typeof replyInput>;
export type AssistInput = z.infer<typeof assistInput>;
export type EndInput = z.infer<typeof endInput>;

// --- what the app reads ---------------------------------------------------------

/** A sentence in the language being learned, with what helps read it. */
export interface TargetText {
  text: string;
  /** Japanese only: kana over each kanji run. */
  furigana?: FuriganaSegment[];
  /** Japanese only, when `furigana` could not be made: the whole sentence in kana. */
  reading?: string;
  /** In the interface language; absent when that is the language being learned. */
  translation?: string;
}

/**
 * 「跟著說」: how the person answers this turn's question. `key` is the
 * question's 答法 (see `ANSWER_TYPES`), so the same kind of answer is
 * recognised across turns and topics however the model words it.
 */
export interface ChatPattern {
  key: string;
  /** The structure with one blank, written ＿＿ for Japanese and ___ for English. */
  template: string;
  translation?: string;
}

/** One answer the person can drop into their draft: what fills the blank, and the whole sentence. */
export interface ChatOption {
  label: string;
  answer: TargetText;
}

/** 「給我提示」: a word worth using now. `wordId` only when it is a catalogue entry of this topic. */
export interface ChatKeyword {
  text: string;
  reading?: string;
  meaning: string;
  wordId?: string;
}

export const AI_INTENTS = ["opening", "share", "follow_up", "answer", "clarify", "role_invite", "another"] as const;
export type AiIntent = (typeof AI_INTENTS)[number];

export interface AiMessageBody {
  intent: AiIntent;
  /** Opening only: one line naming the imagined situation, in the interface language. */
  scene?: string;
  /** What Moira says — the question, if any, is inside it. */
  line: TargetText;
  /** False when the turn leaves room to talk rather than asking something. */
  awaitsAnswer: boolean;
  pattern?: ChatPattern;
  /** 「示範回答」: one whole answer the person could send. */
  example?: TargetText;
  options: ChatOption[];
  keywords: ChatKeyword[];
  /** Catalogue entries of the topic to show as picture cards. */
  wordIds: string[];
  /** 「簡單一點」: the same question again, easier, added under the turn. */
  simpler?: { note: string; line?: TargetText; options: ChatOption[] };
}

export interface UserMessageBody {
  text: string;
  support: SupportKind[];
}

export interface TopicMessageBody {
  name: string;
}

export type MessageKind = "ai" | "user" | "topic";

export interface ChatMessage {
  id: string;
  kind: MessageKind;
  topicId: string;
  topicVersion: number;
  createdAt: string;
  ai?: AiMessageBody;
  user?: UserMessageBody;
  topic?: TopicMessageBody;
}

export interface ReviewPhrase {
  text: TargetText;
  /** "you": the person said it. "moira": Moira showed it. */
  source: "you" | "moira";
  messageId: string;
}

export interface ChatReview {
  topics: { id: string; name: string }[];
  phrases: ReviewPhrase[];
  /** 「下次可以試」: a new way of saying something, marked as a suggestion. */
  tryNext?: TargetText;
  /** One direction to talk about next time, in the interface language. */
  nextIdea: string;
}

export type ChatStatus = "active" | "ended";

export interface ChatSummary {
  id: string;
  learningDirection: LearningDirection;
  topicId: string;
  topicName: string;
  topicVersion: number;
  status: ChatStatus;
  createdAt: string;
  updatedAt: string;
  /** How many times the person answered. Zero means no review is offered. */
  answers: number;
  /** Points this conversation's replies took. */
  spent: number;
  review?: ChatReview;
}

export type RequestKind = "opening" | "reply" | "another" | "simplify" | "express" | "review";
export type RequestStatus = "pending" | "committed" | "failed" | "stopped" | "stale";

/** What a client should show for a generation that has not finished. */
export interface PendingRequest {
  requestId: string;
  kind: RequestKind;
  /** A reply's answer, so a relaunched app can show it waiting. */
  text?: string;
}

export interface ChatOffer {
  minPoints: number;
  maxPoints: number;
  available: number;
}

export interface ChatState {
  chat: ChatSummary;
  messages: ChatMessage[];
  pending?: PendingRequest;
  /** The current topic has no opening yet: the last one failed or never ran. */
  needsOpening: boolean;
  /** Free assists left before the next answer. */
  assistsLeft: number;
  offer: ChatOffer;
}

export type TopicChatErrorCode =
  | "invalid_topic_chat_request"
  | "topic_unavailable"
  | "chat_not_found"
  | "chat_ended"
  | "chat_busy"
  | "request_stale"
  | "message_outdated"
  | "assist_limit"
  | "assistant_unavailable"
  | "rate_limited";

export class TopicChatError extends Error {
  constructor(public readonly code: TopicChatErrorCode, public readonly retryAfterSeconds?: number) {
    super(code);
  }
}
