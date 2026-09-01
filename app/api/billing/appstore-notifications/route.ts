import { NextResponse } from "next/server";
import {
  getUserIdByOriginalTransaction,
  upsertAtlasEntitlement,
} from "@/lib/atlas/entitlement";
import { entitlementFromTransaction } from "@/lib/billing/appstore";
import { verifyNotification, verifyTransaction } from "@/lib/billing/verifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// App Store Server Notifications V2 webhook. Apple POSTs { signedPayload } on
// renew / refund / expire / billing changes. We decode the embedded transaction,
// map it to our user via original_transaction_id (recorded at verify time), and
// re-derive the entitlement. Always 200 so Apple does not retry indefinitely on
// a payload we simply can't map yet.
//
// This endpoint is UNAUTHENTICATED — its trust comes from verifying Apple's JWS
// signature (lib/billing/verifier.ts). A payload that fails verification is
// ignored (200, handled:false) so a bad/forged POST neither mutates state nor
// triggers Apple retries.
export async function POST(req: Request) {
  let body: { signedPayload?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const signedPayload = typeof body.signedPayload === "string" ? body.signedPayload : null;
  if (!signedPayload) {
    return NextResponse.json({ error: "signedPayload required" }, { status: 400 });
  }

  try {
    const notification = await verifyNotification(signedPayload);
    const signedTx = notification.data?.signedTransactionInfo;
    if (!signedTx) {
      // Nothing transaction-shaped to act on (e.g. TEST notifications).
      return NextResponse.json({ ok: true, handled: false });
    }

    const entitlement = entitlementFromTransaction(await verifyTransaction(signedTx));
    if (!entitlement.originalTransactionId) {
      return NextResponse.json({ ok: true, handled: false });
    }

    const mappedUserId = await getUserIdByOriginalTransaction(entitlement.originalTransactionId);
    // New purchases carry the Supabase UUID in Apple's signed appAccountToken,
    // so notifications can be routed before the client verify call. Legacy
    // purchases fall back to their immutable first binding.
    const userId = entitlement.appAccountToken ?? mappedUserId;
    if (!userId) {
      // We have not seen this subscription via an authenticated verify yet.
      console.warn(
        "[appstore-notifications] unmapped subscription",
        entitlement.originalTransactionId,
        notification.notificationType,
      );
      return NextResponse.json({ ok: true, handled: false });
    }

    const result = await upsertAtlasEntitlement({
      userId,
      tier: entitlement.tier,
      source: entitlement.source,
      expiresAt: entitlement.expiresAt,
      originalTransactionId: entitlement.originalTransactionId,
      transactionId: entitlement.transactionId,
      signedAt: entitlement.signedAt,
      appAccountToken: entitlement.appAccountToken,
    });

    return NextResponse.json({
      ok: true,
      handled: true,
      state: result.status,
      notificationType: notification.notificationType ?? null,
    });
  } catch (err) {
    console.error("[appstore-notifications] failed", err);
    // Still 200: a malformed/unverifiable payload shouldn't trigger Apple retries.
    return NextResponse.json({ ok: true, handled: false });
  }
}
