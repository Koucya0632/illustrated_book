import { z } from "zod";
import { CreditError, type CreditConfig } from "../credits/policy";
import { acceptQuoteInput, confirmCandidateInput, OperationError } from "./contracts";
import type { AiOperations } from "./service";

type Action = "quote" | "accept" | "read" | "list" | "cancel" | "confirm";
interface Dependencies {
  currentUserId: () => Promise<string | null>;
  config: (userId: string) => CreditConfig;
  enabled: () => boolean;
  operations: () => AiOperations;
  reportError: () => void;
}
const headers = { "Cache-Control": "private, no-store" };
async function body(request: Request) {
  if (Number(request.headers.get("content-length")) > 4096 || !request.body) throw new OperationError("invalid_ai_request");
  const reader = request.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new OperationError("invalid_ai_request"); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  try { return JSON.parse(text); } catch { throw new OperationError("invalid_ai_request"); }
}
function parse<Schema extends z.ZodType>(schema: Schema, value: unknown): z.infer<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) throw new OperationError("invalid_ai_request");
  return result.data;
}

export function createAiHandler(deps: Dependencies) {
  return async (request: Request, action: Action, id?: string): Promise<Response> => {
    try {
      const userId = await deps.currentUserId();
      if (!userId) return Response.json({ error: "unauthorized" }, { status: 401, headers });
      if (action !== "read" && action !== "list") {
        const origin = request.headers.get("origin");
        if (request.headers.get("sec-fetch-site") === "cross-site" ||
            (origin !== null && origin !== new URL(request.url).origin)) {
          return Response.json({ error: "forbidden" }, { status: 403, headers });
        }
      }
      const config = deps.config(userId);
      // A paused acceptance can recover an existing key without creating new work.
      const allowNew = config.mode === "live" && deps.enabled();
      const newWork = action === "quote";
      if (action === "accept" && !allowNew && !config.readEnabled) throw new CreditError("credits_disabled");
      if (newWork ? config.mode !== "live" || !deps.enabled() : config.mode !== "live" && !config.readEnabled) {
        throw new CreditError("credits_disabled");
      }
      if (id !== undefined) parse(z.string().uuid(), id);
      const account = { userId, environment: config.environment };
      const operations = deps.operations();
      const result = action === "quote" ? await operations.quote(account, await body(request)) :
        action === "accept" ? await operations.accept(account, parse(acceptQuoteInput, await body(request)).quoteId, request.headers.get("idempotency-key") ?? "", allowNew) :
          action === "read" ? await operations.read(account, id!) :
            action === "list" ? await operations.list(account) :
            action === "cancel" ? await operations.cancel(account, id!) :
              await (async () => {
                const { candidateId, ...correction } = parse(confirmCandidateInput, await body(request));
                return operations.confirm(account, id!, candidateId, correction);
              })();
      return Response.json(result, { status: action === "accept" && "state" in result && result.state === "reserved" ? 202 : 200, headers });
    } catch (error) {
      if (error instanceof OperationError) {
        const status = ["quote_not_found", "operation_not_found", "image_not_found"].includes(error.code) ? 404 :
          ["invalid_ai_request", "invalid_ai_result"].includes(error.code) ? 400 : 409;
        return Response.json({ error: error.code }, { status, headers });
      }
      if (error instanceof CreditError) {
        const status = error.code === "credits_disabled" ? 404 :
          ["credits_not_enrolled", "benefit_ineligible"].includes(error.code) ? 403 :
            error.code === "invalid_credit_request" ? 400 :
              ["insufficient_credits", "idempotency_conflict"].includes(error.code) ? 409 : 503;
        return Response.json({ error: error.code }, { status, headers });
      }
      deps.reportError();
      return Response.json({ error: "credits_unavailable" }, { status: 503, headers });
    }
  };
}
