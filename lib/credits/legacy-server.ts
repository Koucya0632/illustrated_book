import { getSql } from "../db";
import { CREDIT_POLICY, userCreditConfig } from "./policy";
import { isCreditAccount } from "./legacy-guard";

export function usesCreditBilling(userId: string) {
  return isCreditAccount(getSql(), userId, userCreditConfig(userId));
}

/**
 * The answer every retired 自製圖鑑 write gives: upload-with-recognition,
 * re-recognise, confirm and enrich under /api/atlas. AI now runs only through
 * /api/ai (docs/adr/0016 in tuji-ios); these routes stay so a released app
 * gets a sentence it already knows how to show instead of a 404.
 *
 * Two answers, because released apps route them differently: a credit account
 * on an old build must update (409), anyone else is a non-member and is sent
 * to the membership page (402 — what v2 Free already received here).
 */
export async function refuseLegacyAtlasWrite(userId: string): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    if (await usesCreditBilling(userId)) {
      return Response.json({ error: "update_required", billingMode: "credits" }, { status: 409, headers });
    }
  } catch {
    return Response.json({ error: "credits_unavailable" }, { status: 503 });
  }
  return Response.json({
    error: "quota_exceeded",
    scope: "capacity",
    message: `自製圖鑑是會員功能，成為永久會員可建立 ${CREDIT_POLICY.lifetimeAtlasSlots} 格。`,
  }, { status: 402, headers });
}
