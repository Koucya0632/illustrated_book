/**
 * What a failed AI request log line may carry: the error's class, HTTP status,
 * the API's error type and message, and its request id. Never the user's input,
 * the prompt, or credentials. Before this, failures logged only "request
 * failed", so a rejected API key looked the same as a malformed model reply.
 *
 * Duck-typed rather than `instanceof Anthropic.APIError`: the SDK ships both
 * ESM and CJS builds, and a class from the other build fails instanceof.
 */
export function aiErrorSummary(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { kind: typeof error };
  const e = error as Error & {
    status?: unknown;
    code?: unknown;
    requestID?: unknown;
    error?: { error?: { type?: unknown; message?: unknown } };
  };
  const summary: Record<string, unknown> = { kind: e.constructor.name };
  if (typeof e.status === "number") summary.status = e.status;
  if (typeof e.code === "string") summary.code = e.code;
  const api = e.error?.error;
  if (typeof api?.type === "string") summary.type = api.type;
  if (typeof api?.message === "string") summary.message = api.message.slice(0, 200);
  if (typeof e.requestID === "string") summary.requestId = e.requestID;
  return summary;
}
