import { NextResponse } from "next/server";
import {
  getUserIdByOriginalTransaction,
  upsertAtlasEntitlement,
} from "@/lib/atlas/entitlement";
import {
  decodeNotification,
  decodeTransaction,
  entitlementFromTransaction,
} from "@/lib/billing/appstore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// App Store Server Notifications V2 webhook. Apple POSTs { signedPayload } on
// renew / refund / expire / billing changes. We decode the embedded transaction,
// map it to our user via original_transaction_id (recorded at verify time), and
// re-derive the entitlement. Always 200 so Apple does not retry indefinitely on
// a payload we simply can't map yet.
//
// ⚠️ This endpoint is UNAUTHENTICATED and currently trusts the JWS without
// verifying Apple's signature (see lib/billing/appstore.ts). Add
// SignedDataVerifier before production — until then, treat it as sandbox-only.
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
    const notification = decodeNotification(signedPayload);
    const signedTx = notification.data?.signedTransactionInfo;
    if (!signedTx) {
      // Nothing transaction-shaped to act on (e.g. TEST notifications).
      return NextResponse.json({ ok: true, handled: false });
    }

    const entitlement = entitlementFromTransaction(decodeTransaction(signedTx));
    if (!entitlement.originalTransactionId) {
      return NextResponse.json({ ok: true, handled: false });
    }

    const userId = await getUserIdByOriginalTransaction(entitlement.originalTransactionId);
    if (!userId) {
      // We have not seen this subscription via an authenticated verify yet.
      console.warn(
        "[appstore-notifications] unmapped subscription",
        entitlement.originalTransactionId,
        notification.notificationType,
      );
      return NextResponse.json({ ok: true, handled: false });
    }

    await upsertAtlasEntitlement({
      userId,
      tier: entitlement.tier,
      source: entitlement.source,
      expiresAt: entitlement.expiresAt,
      originalTransactionId: entitlement.originalTransactionId,
    });

    return NextResponse.json({
      ok: true,
      handled: true,
      notificationType: notification.notificationType ?? null,
    });
  } catch (err) {
    console.error("[appstore-notifications] failed", err);
    // Still 200: a malformed/unverifiable payload shouldn't trigger Apple retries.
    return NextResponse.json({ ok: true, handled: false });
  }
}
