// Errors every paid 助手 step shares.

export type AssistantErrorCode =
  | "invalid_assistant_request" | "assistant_unavailable" | "rate_limited";

export class AssistantError extends Error {
  constructor(public readonly code: AssistantErrorCode, public readonly retryAfterSeconds?: number) {
    super(code);
  }
}
