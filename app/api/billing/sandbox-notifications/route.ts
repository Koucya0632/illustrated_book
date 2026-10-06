import { verifyNotification, verifyTransaction } from "@/lib/billing/verifier";
import { creditReviewUsers } from "@/lib/credits/policy";
import { createSandboxNotificationHandler } from "@/lib/credits/sandbox-notifications-http";
import { POST as receiveNotification } from "../appstore-notifications/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = createSandboxNotificationHandler({
  verifyNotification: signed => verifyNotification(signed, true),
  verifyTransaction: signed => verifyTransaction(signed, true),
  reviewUsers: creditReviewUsers,
  receiveReview: signedPayload => receiveNotification(new Request("https://everyday-english-picture-dictionary.vercel.app/api/billing/appstore-notifications", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signedPayload }),
  })),
  // Fixed destination prevents request-controlled URLs or forwarding loops.
  forwardTest: signedPayload => fetch("https://tuji-credits-sandbox.vercel.app/api/billing/appstore-notifications", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signedPayload }),
    signal: AbortSignal.timeout(45000), redirect: "error",
  }),
});
