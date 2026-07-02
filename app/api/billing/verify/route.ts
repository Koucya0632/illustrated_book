import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { upsertAtlasEntitlement } from "@/lib/atlas/entitlement";
import { entitlementFromTransaction } from "@/lib/billing/appstore";
import { BillingVerificationError, verifyTransaction } from "@/lib/billing/verifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Client-initiated verification: iOS sends a StoreKit 2 signed transaction (JWS)
// after a purchase / restore / background renewal. Authenticated, so the userId
// comes from the session; we record the entitlement and the subscription's
// original_transaction_id so the notifications webhook can map renewals back.
//
// Signatures are verified via lib/billing/verifier.ts (Apple SignedDataVerifier).
export async function POST(req: Request) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { signedTransaction?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const signed = typeof body.signedTransaction === "string" ? body.signedTransaction : null;
  if (!signed) {
    return NextResponse.json({ error: "signedTransaction required" }, { status: 400 });
  }

  let entitlement;
  try {
    entitlement = entitlementFromTransaction(await verifyTransaction(signed));
  } catch (err) {
    if (err instanceof BillingVerificationError) {
      // Verifier not configured (missing root certs / bundleId) — a server
      // misconfiguration, not the client's fault. Fail closed.
      console.error("[billing/verify] not configured", err);
      return NextResponse.json({ error: "billing not configured" }, { status: 503 });
    }
    // Signature invalid / untrusted transaction.
    return NextResponse.json({ error: "invalid transaction" }, { status: 400 });
  }

  await upsertAtlasEntitlement({
    userId,
    tier: entitlement.tier,
    source: entitlement.source,
    expiresAt: entitlement.expiresAt,
    originalTransactionId: entitlement.originalTransactionId,
  });

  return NextResponse.json(
    { tier: entitlement.tier, expiresAt: entitlement.expiresAt },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
