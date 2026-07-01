import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { upsertAtlasEntitlement } from "@/lib/atlas/entitlement";
import { decodeTransaction, entitlementFromTransaction } from "@/lib/billing/appstore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Client-initiated verification: iOS sends a StoreKit 2 signed transaction (JWS)
// after a purchase / restore / background renewal. Authenticated, so the userId
// comes from the session; we record the entitlement and the subscription's
// original_transaction_id so the notifications webhook can map renewals back.
//
// NOTE: signature verification is deferred — see lib/billing/appstore.ts.
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
    entitlement = entitlementFromTransaction(decodeTransaction(signed));
  } catch {
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
