import { CreditError, type CreditEnvironment } from "./policy";
import type { createAdminCreditGrants } from "./admin-grants";

type Dependencies = {
  authorized: () => Promise<boolean>;
  environment: (userId: string) => CreditEnvironment;
  grants: () => ReturnType<typeof createAdminCreditGrants>;
  reportError: () => void;
};
const headers = { "Cache-Control": "private, no-store" };
export function createAdminCreditGrantsHandler(deps: Dependencies) {
  return async (request: Request, userId: string): Promise<Response> => {
    try {
      if (!await deps.authorized()) return Response.json({ error: "unauthorized" }, { status: 401, headers });
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
        throw new CreditError("invalid_credit_request");
      }
      if (request.method === "POST") {
        const origin = request.headers.get("origin");
        if (request.headers.get("sec-fetch-site") === "cross-site" ||
            (origin !== null && origin !== new URL(request.url).origin)) {
          return Response.json({ error: "forbidden" }, { status: 403, headers });
        }
      }
      const account = { userId, environment: deps.environment(userId) };
      if (request.method === "GET") {
        return Response.json({ environment: account.environment, ...await deps.grants().read(account) }, { headers });
      }
      if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405, headers });
      const reader = request.body?.getReader();
      if (!reader) throw new CreditError("invalid_credit_request");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 4096) { await reader.cancel(); throw new CreditError("invalid_credit_request"); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      let body: unknown;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { throw new CreditError("invalid_credit_request"); }
      return Response.json(await deps.grants().grant(account, body, "admin"), { headers });
    } catch (error) {
      if (error instanceof CreditError) {
        const status = error.code === "invalid_credit_request" ? 400 :
          ["idempotency_conflict", "credits_not_enrolled", "benefit_ineligible", "credits_disabled"].includes(error.code) ? 409 : 503;
        return Response.json({ error: error.code }, { status, headers });
      }
      deps.reportError();
      return Response.json({ error: "credits_unavailable" }, { status: 503, headers });
    }
  };
}
