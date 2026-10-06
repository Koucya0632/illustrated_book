import { getSql } from "../db";
import { userCreditConfig } from "./policy";
import { isCreditAccount } from "./legacy-guard";

export function usesCreditBilling(userId: string) {
  return isCreditAccount(getSql(), userId, userCreditConfig(userId));
}
export async function guardLegacyAtlasWrite(userId: string): Promise<Response | null> {
  try {
    if (!await usesCreditBilling(userId)) return null;
    return Response.json({ error: "update_required", billingMode: "credits" }, {
      status: 409, headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json({ error: "credits_unavailable" }, { status: 503 });
  }
}
