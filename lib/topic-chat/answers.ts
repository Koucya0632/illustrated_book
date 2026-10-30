// 答法 the person actually answered. A 答法 counts as practised only once the
// person answered Moira's question with its 跟著說 — by picking an option, or
// by writing a sentence of that shape — never because Moira merely asked it.
// The chat uses this to decide when Moira shows her own answer first, and the
// review lists what was practised from it; both read the same rule here.
//
// What someone has practised is theirs, not a conversation's: starting a new
// chat does not unlearn how to give a reason. So a scan runs per conversation —
// a question at the end of one is not answered by the first line of the next —
// and `practisedAcross` unions the results.

import type { AiMessageBody, UserMessageBody } from "./contracts";
import { ANSWER_TYPES, plain } from "./model";
import type { AnswerMessage } from "./store";

/** One answer the person gave with a 跟著說. */
export interface AnsweredPattern {
  type: string;
  pattern: string;
  /** The sentence of theirs that has the pattern's shape, or the option they picked. */
  answer: string;
  messageId: string;
}

/** The order a review lists 答法 in: what takes a conversation further first. */
export const REVIEW_ORDER = [
  "reason", "experience", "plan", "who", "when", "how_often", "how_many", "describe",
  "choose_one", "like", "want_to", "where", "what", "agree", "ask_back", "other",
] as const;

/** What 下次可以試 may suggest: kinds of answer worth a sentence of their own. */
const TRY_NEXT_TYPES = [
  "reason", "experience", "plan", "who", "when", "how_often", "describe", "choose_one", "like", "want_to", "where", "what",
] as const;

const SENTENCE_END = /(?<=[。．.!！?？])/u;

/** The sentence of `text` that fills `pattern`'s one blank, or null. */
export function fillingSentence(pattern: string, text: string): string | null {
  const parts = plain(pattern).split(/_+/u);
  if (parts.length !== 2) return null;
  const [before, after] = parts;
  for (const sentence of text.split(SENTENCE_END)) {
    const s = plain(sentence);
    if (s.length > before.length + after.length && s.startsWith(before) && s.endsWith(after)) return sentence.trim();
  }
  return null;
}

/** The person's answers that used the 跟著說 they were given, oldest first. */
export function answeredPatterns(messages: AnswerMessage[]): AnsweredPattern[] {
  const answered: AnsweredPattern[] = [];
  let asked: { pattern: NonNullable<AiMessageBody["pattern"]>; topicVersion: number } | undefined;
  for (const m of messages) {
    if (m.kind === "ai") {
      const pattern = (m.body as unknown as AiMessageBody).pattern;
      asked = pattern && (ANSWER_TYPES as readonly string[]).includes(pattern.key)
        ? { pattern, topicVersion: m.topicVersion } : undefined;
    } else if (m.kind === "user") {
      const body = m.body as unknown as UserMessageBody;
      if (asked && asked.topicVersion === m.topicVersion) {
        const sentence = fillingSentence(asked.pattern.template, body.text)
          ?? ((body.support ?? []).includes("option") ? body.text.trim() : null);
        if (sentence) answered.push({ type: asked.pattern.key, pattern: asked.pattern.template, answer: sentence, messageId: m.id });
      }
      asked = undefined;
    } else {
      asked = undefined;
    }
  }
  return answered;
}

/** 答法 answered in one conversation, oldest first, each once. */
export function practisedTypes(messages: AnswerMessage[]): string[] {
  return [...new Set(answeredPatterns(messages).map(a => a.type))];
}

/**
 * 答法 the person has answered at all: this conversation's first, in the order
 * they came, then the ones only earlier conversations have.
 */
export function practisedAcross(current: AnswerMessage[], earlier: AnswerMessage[][]): string[] {
  return [...new Set([current, ...earlier].flatMap(practisedTypes))];
}

/** 練習過的答法: one answer per 答法, those that go further first, at most `limit`. */
export function reviewAnswerTypes(messages: AnswerMessage[], limit = 3): AnsweredPattern[] {
  const first = new Map<string, AnsweredPattern>();
  for (const a of answeredPatterns(messages)) if (!first.has(a.type)) first.set(a.type, a);
  return [...first.values()]
    .sort((a, b) => REVIEW_ORDER.indexOf(a.type as never) - REVIEW_ORDER.indexOf(b.type as never))
    .slice(0, limit);
}

/**
 * 答法 that 下次可以試 may suggest: the ones not answered yet. It takes the
 * practised list rather than messages, so the caller decides whether that is
 * one conversation or all of them — suggesting a 答法 the person has given in
 * another chat is the thing this is for.
 */
export function untriedTypes(practised: string[]): string[] {
  const done = new Set(practised);
  return TRY_NEXT_TYPES.filter(type => !done.has(type));
}
