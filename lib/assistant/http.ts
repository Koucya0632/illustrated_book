// 助手's request handler, with everything it reaches passed in — the same shape
// as `createAiHandler`, so the rules below are tested without a database, a
// model or a session.
//
// The order is the policy: nothing is spent until the person is known to be a
// 罐頭點數 account holding at least the ceiling price, and nothing is charged
// until an in-scope answer exists.

import { CreditError, type CreditConfig } from "../credits/policy";
import type { CreditAccount, CreditBalance, CreditTransaction } from "../credits/wallet";
import { readLimitedJson, RequestBodyTooLargeError } from "../request-body";
import {
  ASSISTANT_MAX_BODY_BYTES, AssistantError, assistantAskInput,
  type AssistantAskInput, type AssistantModelReply, type AssistantModelRequest, type AssistantWord,
} from "./contracts";
import { ASSISTANT_PRICING, assistantPoints } from "./pricing";
import type { AssistantUsageRecord } from "./usage";

interface Wallet {
  readWallet(account: CreditAccount): Promise<CreditBalance>;
  transact<T>(account: CreditAccount, run: (scope: CreditTransaction) => Promise<T>): Promise<T>;
}

export interface AssistantDependencies {
  currentUserId: () => Promise<string | null>;
  config: (userId: string) => CreditConfig;
  /** The feature switch and the model credential, checked before any work. */
  enabled: () => boolean;
  wallet: () => Wallet;
  /** Throws `AssistantError("rate_limited")` when the caller is over a limit. */
  rateLimit: (userId: string) => Promise<void>;
  loadWords: (input: Pick<AssistantAskInput, "wordIds" | "uiLanguage" | "learningDirection">) => Promise<AssistantWord[]>;
  ask: (request: AssistantModelRequest) => Promise<AssistantModelReply>;
  /** One row per answer the model produced: its tokens against the points charged. */
  record: (entry: AssistantUsageRecord) => Promise<void>;
  reportError: () => void;
}

const headers = { "Cache-Control": "private, no-store" };
const pricing = { minPoints: ASSISTANT_PRICING.minPoints, maxPoints: ASSISTANT_PRICING.maxPoints };

async function input(request: Request): Promise<AssistantAskInput> {
  let raw: unknown;
  try {
    raw = await readLimitedJson(request, ASSISTANT_MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError || error instanceof SyntaxError) {
      throw new AssistantError("invalid_assistant_request");
    }
    throw error;
  }
  const parsed = assistantAskInput.safeParse(raw);
  if (!parsed.success) throw new AssistantError("invalid_assistant_request");
  return parsed.data;
}

/**
 * Charge exactly `points` under one key. The wallet settles a reservation for
 * its full amount only, so the amount is reserved and committed together once
 * it is known, rather than held at the ceiling and settled for less.
 */
async function charge(wallet: Wallet, account: CreditAccount, key: string, points: number) {
  return wallet.transact(account, async scope => {
    await scope.reserve(key, points);
    return scope.settle(key, "commit");
  });
}

export function createAssistantHandler(deps: AssistantDependencies) {
  return async (request: Request, action: "offer" | "ask"): Promise<Response> => {
    try {
      const userId = await deps.currentUserId();
      if (!userId) return Response.json({ error: "unauthorized" }, { status: 401, headers });
      if (action === "ask") {
        const origin = request.headers.get("origin");
        if (request.headers.get("sec-fetch-site") === "cross-site" ||
            (origin !== null && origin !== new URL(request.url).origin)) {
          return Response.json({ error: "forbidden" }, { status: 403, headers });
        }
      }
      const config = deps.config(userId);
      if (config.mode !== "live" || !deps.enabled()) throw new CreditError("credits_disabled");
      const account = { userId, environment: config.environment };
      const wallet = deps.wallet();

      // Also the membership gate: reading the wallet of an account that is not
      // on 罐頭點數 throws `credits_not_enrolled`.
      const balance = await wallet.readWallet(account);
      if (action === "offer") {
        return Response.json({ ...pricing, available: balance.available }, { headers });
      }

      const body = await input(request);
      if (balance.reconciliationRequired) throw new CreditError("credits_reconciliation_required");
      // The ceiling, not the floor: an answer must never cost more than the
      // person was holding when they asked.
      if (balance.available < pricing.maxPoints) throw new CreditError("insufficient_credits");
      await deps.rateLimit(userId);

      const words = await deps.loadWords(body);
      const reply = await deps.ask({
        question: body.question, uiLanguage: body.uiLanguage, learningDirection: body.learningDirection,
        words, history: body.history,
      });

      // Out of scope is the assistant declining, and a refusal is not a product.
      let charged = 0, available = balance.available;
      if (reply.inScope) {
        const points = assistantPoints(reply.usage);
        try {
          const settled = await charge(wallet, account, `assistant:${body.requestId}`, points);
          charged = points;
          available = settled.wallet.available;
        } catch (error) {
          // The answer exists and was paid for upstream. Losing a point or two
          // to a race is cheaper than withholding it; a resend under the same
          // id that priced differently was already charged the first time.
          if (!(error instanceof CreditError) ||
              !["insufficient_credits", "idempotency_conflict"].includes(error.code)) throw error;
        }
      }
      // Bookkeeping, not part of the answer: the person has paid and the reply
      // exists, so a failed write is reported and the answer still goes out.
      try {
        await deps.record({ account, requestId: body.requestId, inScope: reply.inScope, usage: reply.usage, charged });
      } catch {
        deps.reportError();
      }
      return Response.json({
        answer: reply.answer, inScope: reply.inScope, wordIds: reply.wordIds,
        charged, available, ...pricing,
      }, { headers });
    } catch (error) {
      if (error instanceof AssistantError) {
        const status = error.code === "invalid_assistant_request" ? 400 : error.code === "rate_limited" ? 429 : 503;
        const retry: Record<string, string> = error.retryAfterSeconds
          ? { "Retry-After": String(error.retryAfterSeconds) } : {};
        return Response.json({ error: error.code }, { status, headers: { ...headers, ...retry } });
      }
      if (error instanceof CreditError) {
        const status = error.code === "credits_disabled" ? 404 :
          ["credits_not_enrolled", "benefit_ineligible"].includes(error.code) ? 403 :
            error.code === "insufficient_credits" ? 409 : 503;
        return Response.json({ error: error.code, ...pricing }, { status, headers });
      }
      deps.reportError();
      return Response.json({ error: "assistant_unavailable" }, { status: 503, headers });
    }
  };
}
