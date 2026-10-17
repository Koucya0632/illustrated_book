import { z } from "zod";
import { readLimitedJson } from "../../request-body";
import { CreditError, type CreditConfig } from "../../credits/policy";
import type { CreditAccount, CreditBalance } from "../../credits/wallet";
import { inputSchema, modelReplySchema, modes, pointsFor, PRICES, GRAMMAR_VERSION, GrammarError } from "./contracts";
import { normalizeReply, type GrammarModel } from "./model";
import { fingerprint, type GrammarStore } from "./store";

export interface GrammarDependencies {
  userId(): Promise<string | null>;
  config(userId: string): CreditConfig;
  enabled(): boolean;
  balance(account: CreditAccount): Promise<CreditBalance>;
  store(): GrammarStore;
  generate: GrammarModel;
  rateLimit(userId: string): Promise<void>;
  reportError(): void;
}
export type GrammarAction = "offer" | "generate" | "list" | "read" | "favorite" | "delete";
const headers = { "Cache-Control": "private, no-store", "Vary": "Authorization, Cookie" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
// History is per learning direction only: a card keeps the language it was explained in.
const scopeSchema = z.object({ learningDirection: z.enum(["zh-en", "zh-ja"]) });
const uuid = z.string().uuid();

export function createGrammarHandler(deps: GrammarDependencies) {
  return async (request: Request, action: GrammarAction, id?: string): Promise<Response> => {
    try {
      const userId = await deps.userId();
      if (!userId) return json({ error: "unauthorized" }, 401);
      if (["generate", "favorite", "delete"].includes(action)) {
        const origin = request.headers.get("origin");
        if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(request.url).origin)) {
          return json({ error: "forbidden" }, 403);
        }
      }
      const config = deps.config(userId);
      const account = { userId, environment: config.environment };
      const store = deps.store();
      const enabled = config.mode === "live" && deps.enabled();
      if (action === "offer") {
        // Why generation is closed decides what the person is told: switched off for everyone,
        // or a member feature they could join. Off wins, so nobody is sold a closed feature.
        let available = 0, reason: "disabled" | "membership" | null = enabled ? null : "disabled";
        try {
          const balance = await deps.balance(account);
          available = balance.available;
          if (balance.reconciliationRequired) reason ??= "disabled";
        } catch (error) {
          if (!(error instanceof CreditError) || error.code !== "credits_not_enrolled") throw error;
          reason ??= "membership";
        }
        return json({ enabled: reason === null, reason, available, pricingVersion: GRAMMAR_VERSION,
          modes: modes.map(mode => ({ mode, ...PRICES[mode] })) });
      }
      // Saved purchases remain readable when new generation is disabled or membership ends.
      if (action === "list") {
        const params = new URL(request.url).searchParams;
        const scope = scopeSchema.parse(Object.fromEntries(params));
        const cursor = params.get("cursor") ?? undefined;
        if (cursor) uuid.parse(cursor);
        const mode = params.get("mode") ?? undefined;
        if (mode) z.enum(modes).parse(mode);
        return json(await store.list(account, { ...scope, cursor, mode, favorite: params.get("favorite") === "true" }));
      }
      if (["read", "favorite", "delete"].includes(action)) {
        uuid.parse(id);
        if (action === "favorite") {
          const input = z.object({ favorite: z.boolean() }).strict().parse(await readLimitedJson(request, 256));
          return json({ record: await store.favorite(account, id!, input.favorite) });
        }
        if (action === "delete") return json(await store.delete(account, id!));
        const found = await store.read(account, id!);
        return found ? json({ record: found.record }, found.record.status === "pending" ? 202 : 200) : json({ error: "not_found" }, 404);
      }
      const input = inputSchema.parse(await readLimitedJson(request, 16384));
      // Resolve resends before price/gating checks: a paid result doesn't require paying again.
      const existing = await store.read(account, input.requestId);
      if (existing) {
        if (existing.fingerprint !== fingerprint(input)) throw new GrammarError("idempotency_conflict", 409);
        return json({ record: existing.record }, existing.record.status === "pending" ? 202 : 200);
      }
      if (!enabled) throw new GrammarError("grammar_disabled", 403);
      const price = PRICES[input.mode];
      if (input.pricingVersion !== GRAMMAR_VERSION || input.maxPoints !== price.maxPoints) {
        throw new GrammarError("price_changed", 409);
      }
      const balance = await deps.balance(account);
      if (balance.reconciliationRequired) throw new CreditError("credits_reconciliation_required");
      if (balance.available < price.maxPoints) throw new CreditError("insufficient_credits");
      await deps.rateLimit(userId);
      const begun = await store.begin(account, input);
      if (!begun.claimed) return json({ record: begun.record }, begun.record.status === "pending" ? 202 : 200);
      try {
        const generated = await deps.generate(input);
        const reply = normalizeReply(modelReplySchema.parse(generated.reply), input);
        const record = await store.complete(account, input, reply, pointsFor(input.mode, generated.usage), generated.usage);
        return json({ record });
      } catch (error) {
        // A commit whose acknowledgement was lost may already exist. fail only updates pending rows.
        const code = error instanceof CreditError ? error.code : "generation_failed";
        await store.fail(account, input.requestId, code);
        const saved = await store.read(account, input.requestId);
        deps.reportError();
        if (saved) return json({ record: saved.record });
        throw error;
      }
    } catch (error) {
      if (error instanceof GrammarError) return json({ error: error.code }, error.status);
      if (error instanceof CreditError) return json({ error: error.code },
        error.code === "insufficient_credits" ? 409 : error.code === "credits_not_enrolled" ? 403 : 503);
      if (error instanceof z.ZodError || error instanceof SyntaxError || (error as Error)?.name === "RequestBodyTooLargeError") {
        return json({ error: "invalid_grammar_request" }, 400);
      }
      if ((error as { code?: string })?.code === "rate_limited") return json({ error: "rate_limited" }, 429);
      deps.reportError();
      return json({ error: "grammar_unavailable" }, 503);
    }
  };
}
