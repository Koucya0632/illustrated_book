// The rules every paid 助手 step shares, with what each step does in between
// passed in. Kept in one place so the steps cannot drift.
//
// The order is the policy: nothing is spent until the person is known to be a
// 罐頭點數 account holding at least the ceiling price, and nothing is charged
// until a deliverable result exists.

import { CreditError, type CreditConfig } from "../credits/policy";
import type { CreditAccount, CreditBalance, CreditTransaction } from "../credits/wallet";
import { readLimitedJson, RequestBodyTooLargeError } from "../request-body";
import { AssistantError, type AssistantErrorCode } from "./contracts";
import type { AssistantUsage } from "./pricing";
import type { AssistantUsageRecord } from "./usage";

interface Wallet {
  readWallet(account: CreditAccount): Promise<CreditBalance>;
  transact<T>(account: CreditAccount, run: (scope: CreditTransaction) => Promise<T>): Promise<T>;
}

/** What every paid step reaches outside itself. */
export interface PaidDependencies {
  currentUserId: () => Promise<string | null>;
  config: (userId: string) => CreditConfig;
  /** The feature switch and the model credential, checked before any work. */
  enabled: () => boolean;
  wallet: () => Wallet;
  /** Throws `AssistantError("rate_limited")` when the caller is over a limit. */
  rateLimit: (userId: string) => Promise<void>;
  /** One row per result the model produced: its tokens against the points charged. */
  record: (entry: AssistantUsageRecord) => Promise<void>;
  reportError: () => void;
}

/** What the model produced, before anything is charged. */
export type Produced =
  | {
    usage: AssistantUsage;
    /** False for a result the person should not pay for, such as an out-of-scope answer. */
    billable: boolean;
    points: number;
    /** The step's own response fields. */
    body: Record<string, unknown>;
  }
  | {
    usage: AssistantUsage;
    /** The model ran but its result cannot be delivered. Recorded, not charged. */
    failed: AssistantErrorCode;
  };

/** One paid step: how it reads a request and what it does with one. */
export interface PaidStep<Body extends { requestId: string }> {
  feature: AssistantUsageRecord["feature"];
  pricingVersion: string;
  pricing: { minPoints: number; maxPoints: number };
  maxBodyBytes: number;
  parse: (raw: unknown) => Body | null;
  /** The ledger key a request is charged under; a resend reuses it. */
  chargeKey: (requestId: string) => string;
  /**
   * False when the step charges what it cost, uncapped. `pricing` is then the
   * typical range and the balance needed to start, and a result costing more
   * than the person holds takes what they hold.
   */
  clamped?: boolean;
  /** Extra offer fields, such as the choices a step offers. */
  offer?: (request: Request) => Record<string, unknown>;
  /**
   * `emit`, passed only when the caller asked for a stream, sends a piece of
   * the result ahead of the rest. A step that never calls it is answered in
   * one piece at the end, as before.
   */
  produce: (body: Body, userId: string, emit?: (part: Record<string, unknown>) => void) => Promise<Produced>;
  /** True when the step can send its result in pieces (`Accept: application/x-ndjson`). */
  streams?: boolean;
}

const headers = { "Cache-Control": "private, no-store" };
const NDJSON = "application/x-ndjson";

function wantsStream(request: Request): boolean {
  return (request.headers.get("accept") ?? "").includes(NDJSON);
}

async function input<Body extends { requestId: string }>(request: Request, step: PaidStep<Body>): Promise<Body> {
  let raw: unknown;
  try {
    raw = await readLimitedJson(request, step.maxBodyBytes);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError || error instanceof SyntaxError) {
      throw new AssistantError("invalid_assistant_request");
    }
    throw error;
  }
  const body = step.parse(raw);
  if (!body) throw new AssistantError("invalid_assistant_request");
  return body;
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

function errorStatus(code: AssistantErrorCode): number {
  if (code === "invalid_assistant_request") return 400;
  if (code === "rate_limited") return 429;
  return 503;
}

export function createPaidHandler<Body extends { requestId: string }>(deps: PaidDependencies, step: PaidStep<Body>) {
  const pricing = step.pricing;

  /**
   * The same run, answered a line of JSON at a time: each piece the step
   * emits, then `done` with the whole result and its price, or `error`.
   *
   * The response starts only when the first piece exists. Until then a
   * failure is the ordinary status code — a refused item is still a 400 —
   * and only a failure after the person has started reading arrives as an
   * `error` line. Nothing is charged for a run that ends in one.
   */
  async function streamRun(
    body: Body,
    userId: string,
    settle: (produced: Produced) => Promise<{ charged: number; available: number }>,
  ): Promise<Response> {
    const encoder = new TextEncoder();
    const early: Uint8Array[] = [];
    let send: ((line: Uint8Array) => void) | null = null;
    let started!: () => void;
    const first = new Promise<"started">(resolve => { started = () => resolve("started"); });
    const line = (value: Record<string, unknown>) => encoder.encode(`${JSON.stringify(value)}\n`);
    const emit = (part: Record<string, unknown>) => {
      if (send) send(line(part));
      else { early.push(line(part)); started(); }
    };
    const run = step.produce(body, userId, emit);
    // A failure before the first piece throws here, to the caller's catch.
    const produced = await Promise.race([first, run]);
    const finished = produced === "started" ? null : produced;
    if (finished && "failed" in finished) {
      await settle(finished);
      return Response.json({ error: finished.failed }, { status: errorStatus(finished.failed), headers });
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let open = true;
        // The person may leave mid-story; the run still finishes and is
        // charged, as a request whose answer was lost would be.
        send = chunk => {
          if (!open) return;
          try { controller.enqueue(chunk); } catch { open = false; }
        };
        for (const chunk of early) send(chunk);
        let last: Record<string, unknown>;
        try {
          const result = finished ?? await run;
          const { charged, available } = await settle(result);
          last = "failed" in result
            ? { type: "error", error: result.failed }
            : { type: "done", ...result.body, charged, available, ...pricing };
        } catch (error) {
          if (!(error instanceof AssistantError)) deps.reportError();
          last = { type: "error", error: error instanceof AssistantError ? error.code : "assistant_unavailable" };
        }
        send(line(last));
        if (open) controller.close();
      },
    });
    return new Response(stream, { headers: { ...headers, "Content-Type": NDJSON } });
  }

  return async (request: Request, action: "offer" | "run"): Promise<Response> => {
    try {
      const userId = await deps.currentUserId();
      if (!userId) return Response.json({ error: "unauthorized" }, { status: 401, headers });
      if (action === "run") {
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
        return Response.json({ ...pricing, available: balance.available, ...step.offer?.(request) }, { headers });
      }

      const body = await input(request, step);
      if (balance.reconciliationRequired) throw new CreditError("credits_reconciliation_required");
      // The ceiling, not the floor: a result must never cost more than the
      // person was holding when they asked.
      if (balance.available < pricing.maxPoints) throw new CreditError("insufficient_credits");
      await deps.rateLimit(userId);

      /** Charges and records one finished result; what the person is told it cost. */
      const settle = async (produced: Produced) => {
        const delivered = !("failed" in produced);
        let charged = 0, available = balance.available;
        if (delivered && produced.billable) {
          const points = step.clamped === false
            ? Math.min(produced.points, balance.available)
            : Math.min(pricing.maxPoints, Math.max(pricing.minPoints, produced.points));
          try {
            const settled = await charge(wallet, account, step.chargeKey(body.requestId), points);
            charged = points;
            available = settled.wallet.available;
          } catch (error) {
            // The result exists and was paid for upstream. Losing a point or two
            // to a race is cheaper than withholding it; a resend under the same
            // id that priced differently was already charged the first time.
            if (!(error instanceof CreditError) ||
                !["insufficient_credits", "idempotency_conflict"].includes(error.code)) throw error;
          }
        }
        // Bookkeeping, not part of the result: a failed write is reported and
        // the response still goes out.
        try {
          await deps.record({
            account, requestId: body.requestId, feature: step.feature, pricingVersion: step.pricingVersion,
            inScope: delivered && produced.billable, usage: produced.usage, charged,
          });
        } catch {
          deps.reportError();
        }
        return { charged, available };
      };

      if (step.streams && wantsStream(request)) return await streamRun(body, userId, settle);

      const produced = await step.produce(body, userId);
      const { charged, available } = await settle(produced);
      if ("failed" in produced) {
        return Response.json({ error: produced.failed }, { status: errorStatus(produced.failed), headers });
      }
      return Response.json({ ...produced.body, charged, available, ...pricing }, { headers });
    } catch (error) {
      if (error instanceof AssistantError) {
        const retry: Record<string, string> = error.retryAfterSeconds
          ? { "Retry-After": String(error.retryAfterSeconds) } : {};
        return Response.json({ error: error.code }, { status: errorStatus(error.code), headers: { ...headers, ...retry } });
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
