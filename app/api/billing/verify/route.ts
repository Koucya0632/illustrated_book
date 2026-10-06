import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { upsertAtlasEntitlement } from "@/lib/atlas/entitlement";
import { classifyTransaction } from "@/lib/billing/appstore";
import { applyLifetimeTransaction } from "@/lib/atlas/lifetime";
import { BillingVerificationError, verifyTransaction } from "@/lib/billing/verifier";
import { isCreditProduct } from "@/lib/credits/store-contracts";
import { deliverCreditPurchase } from "@/lib/credits/store-server";
import { creditStoreError } from "@/lib/credits/store-http";

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

  let classified;
  try {
    classified = classifyTransaction(await verifyTransaction(signed));
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

  // Route by product before writing anything: an unrecognised product must not
  // reach the subscription row (the old mapper downgraded it to 'free').
  if (classified.kind === "unknown") {
    if (isCreditProduct(classified.productId ?? undefined)) {
      try { return NextResponse.json(await deliverCreditPurchase(userId, signed), { headers: { "Cache-Control": "private, no-store" } }); }
      catch (error) { return creditStoreError(error); }
    }
    console.warn("[billing/verify] unsupported product", classified.productId);
    return NextResponse.json({ error: "unsupported product" }, { status: 400 });
  }
  if (classified.kind === "lifetime") {
    const { status } = await applyLifetimeTransaction(userId, classified.holding);
    if (status === "account_mismatch") {
      return NextResponse.json({ error: "purchase belongs to another account" }, { status: 403 });
    }
    if (status === "already_bound" || status === "unbound_legacy") {
      return NextResponse.json({ error: "purchase already linked" }, { status: 409 });
    }
    if (status === "already_owned") {
      // Apple charged, but this account already holds a paid lifetime. The
      // client should have blocked the purchase; support refunds it.
      console.warn("[billing/verify] duplicate lifetime purchase", userId, classified.holding.originalTransactionId);
      return NextResponse.json({ error: "lifetime already owned" }, { status: 409 });
    }
    return NextResponse.json(
      { lifetime: status === "revoke" || status === "ignore" ? "revoked" : "active", state: status },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const entitlement = classified.entitlement;
  const result = await upsertAtlasEntitlement({
    userId,
    tier: entitlement.tier,
    source: entitlement.source,
    expiresAt: entitlement.expiresAt,
    originalTransactionId: entitlement.originalTransactionId,
    transactionId: entitlement.transactionId,
    signedAt: entitlement.signedAt,
    appAccountToken: entitlement.appAccountToken,
    revokedAt: entitlement.revokedAt,
  });

  if (result.status === "account_mismatch") {
    return NextResponse.json({ error: "purchase belongs to another account" }, { status: 403 });
  }
  if (result.status === "already_bound") {
    return NextResponse.json({ error: "subscription already linked" }, { status: 409 });
  }
  if (result.status === "unbound_legacy") {
    return NextResponse.json({ error: "legacy subscription needs account migration" }, { status: 409 });
  }

  return NextResponse.json(
    { tier: result.tier, expiresAt: result.expiresAt },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
