import { CreditError } from "./policy";
import { StoreCreditError } from "./store-contracts";
import { BillingVerificationError } from "../billing/verifier";

export function creditStoreError(error: unknown) {
  const headers = { "Cache-Control": "private, no-store" };
  if (error instanceof StoreCreditError) return Response.json({ error: error.code }, {
    status: error.code === "purchase_account_mismatch" ? 403 : error.code === "purchase_identity_conflict" ? 409 : 400, headers });
  if (error instanceof CreditError || error instanceof BillingVerificationError) return Response.json({ error: "credits_unavailable" }, { status: 503, headers });
  return Response.json({ error: "credits_unavailable" }, { status: 503, headers });
}
