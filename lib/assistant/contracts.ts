// 助手's wire contract — POST /api/assistant/ask.
//
// The app answers 分類 / 收藏 / 詞條 itself, from what it already holds. Only a
// question that lookup could not answer reaches this endpoint, and it is the
// only part of 助手 that calls a model or costs 罐頭點數.

import { z } from "zod";
import type { AssistantUsage } from "./pricing";

/** Room for a question, six short turns of history and eight ids. */
export const ASSISTANT_MAX_BODY_BYTES = 8192;

const text = (max: number) => z.string().trim().min(1).max(max);

export const assistantAskInput = z.object({
  /** Client-generated. A resend under the same id is charged once. */
  requestId: z.string().uuid().transform(value => value.toLowerCase()),
  question: text(500),
  uiLanguage: z.enum(["zh-Hant", "zh-Hans", "ja", "en"]),
  learningDirection: z.enum(["zh-en", "zh-ja"]),
  /**
   * Catalogue words the app thinks the question is about. Ids only: the server
   * reads the entries from its own catalogue, so nothing the client typed is
   * presented to the model as dictionary content.
   */
  wordIds: z.array(z.string().min(1).max(120)).max(8).default([]),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    text: text(600),
  }).strict()).max(6).default([]),
}).strict();
export type AssistantAskInput = z.infer<typeof assistantAskInput>;

/** One catalogue entry handed to the model as grounding. */
export interface AssistantWord {
  id: string;
  word: string;
  reading?: string;
  meaning: string;
}

export interface AssistantModelRequest {
  question: string;
  uiLanguage: AssistantAskInput["uiLanguage"];
  learningDirection: AssistantAskInput["learningDirection"];
  words: AssistantWord[];
  history: AssistantAskInput["history"];
}

export interface AssistantModelReply {
  answer: string;
  /** False when the question is not about language learning, or was declined. */
  inScope: boolean;
  /** Ids of supplied entries the answer is about. */
  wordIds: string[];
  usage: AssistantUsage;
}

export type AssistantErrorCode =
  | "invalid_assistant_request" | "assistant_unavailable" | "rate_limited";

export class AssistantError extends Error {
  constructor(public readonly code: AssistantErrorCode, public readonly retryAfterSeconds?: number) {
    super(code);
  }
}
