import { CreditError, type CreditConfig } from "./policy";
import type { createCreditWallet } from "./wallet";

type Action = "wallet" | "ledger" | "monthly" | "check_in";
interface Dependencies {
  currentUserId: () => Promise<string | null>;
  config: (userId: string) => CreditConfig;
  wallet: () => ReturnType<typeof createCreditWallet>;
  reportError: (error: unknown) => void;
}
const headers = { "Cache-Control": "private, no-store" };

/** Identity, environment, amounts and claim dates never come from the body. */
export function createCreditHandler(deps: Dependencies) {
  return async (request: Request, action: Action): Promise<Response> => {
    try {
      const userId = await deps.currentUserId();
      if (!userId) return Response.json({ error: "unauthorized" }, { status: 401, headers });
      if (action === "monthly" || action === "check_in") {
        const origin = request.headers.get("origin");
        if (request.headers.get("sec-fetch-site") === "cross-site" ||
            (origin !== null && origin !== new URL(request.url).origin)) {
          return Response.json({ error: "forbidden" }, { status: 403, headers });
        }
      }
      const config = deps.config(userId);
      // Shadow mode is reserved for internal comparisons; it issues no user points.
      const isRead = action === "wallet" || action === "ledger";
      if (config.mode !== "live" && !(isRead && config.readEnabled)) throw new CreditError("credits_disabled");
      const account = { userId, environment: config.environment };
      const wallet = deps.wallet();
      const result = action === "wallet" ? await wallet.readWallet(account) :
        action === "ledger" ? await wallet.readLedger(account, new URL(request.url).searchParams.get("cursor") ?? undefined) :
          await wallet.claimBenefit(account, action === "monthly" ? "monthly" : "check_in", config);
      return Response.json(result, { headers });
    } catch (error) {
      if (error instanceof CreditError) {
        const status = error.code === "credits_disabled" || error.code === "benefit_disabled" ? 404 :
          error.code === "credits_not_enrolled" || error.code === "benefit_ineligible" ? 403 :
            error.code === "invalid_credit_request" ? 400 :
              error.code === "idempotency_conflict" || error.code === "insufficient_credits" ||
              error.code === "reservation_already_settled" || error.code === "check_in_requires_study" ? 409 : 503;
        return Response.json({ error: error.code }, { status, headers });
      }
      deps.reportError(error);
      return Response.json({ error: "credits_unavailable" }, { status: 503, headers });
    }
  };
}
