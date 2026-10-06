import type { AppleNotification, AppleTransaction } from "../billing/appstore";

type Dependencies = {
  verifyNotification: (signed: string) => Promise<AppleNotification>;
  verifyTransaction: (signed: string) => Promise<AppleTransaction>;
  reviewUsers: () => string[];
  receiveReview: (signed: string) => Promise<Response>;
  forwardTest: (signed: string) => Promise<Response>;
};

/** Apple's single sandbox endpoint routes signed identities to their existing backend. */
export function createSandboxNotificationHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const headers = { "Cache-Control": "private, no-store" };
    try {
      const text = await request.text();
      if (text.length > 262144) return Response.json({ error: "invalid_body" }, { status: 400, headers });
      let signed: unknown;
      try { signed = JSON.parse(text).signedPayload; } catch { /* Rejected below. */ }
      if (typeof signed !== "string" || !signed) return Response.json({ error: "invalid_body" }, { status: 400, headers });
      const notification = await deps.verifyNotification(signed);
      if (notification.data?.environment !== "Sandbox") return Response.json({ error: "invalid_environment" }, { status: 400, headers });
      const transaction = notification.data.signedTransactionInfo ? await deps.verifyTransaction(notification.data.signedTransactionInfo) : null;
      if (transaction && (transaction.environment !== "Sandbox" || transaction.bundleId !== notification.data.bundleId)) {
        return Response.json({ error: "invalid_identity" }, { status: 400, headers });
      }
      const userId = transaction?.appAccountToken?.toLowerCase();
      const result = userId && deps.reviewUsers().includes(userId) ? await deps.receiveReview(signed) : await deps.forwardTest(signed);
      if (!result.ok) return Response.json({ error: "notification_pending" }, { status: 503, headers });
      return Response.json({ ok: true }, { headers });
    } catch {
      return Response.json({ error: "notification_pending" }, { status: 503, headers });
    }
  };
}
