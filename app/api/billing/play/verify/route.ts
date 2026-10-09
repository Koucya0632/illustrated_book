import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { PlayConfigurationError, PlayPurchaseNotFound } from "@/lib/billing/play";
import { deliverPlayPurchase } from "@/lib/billing/play-delivery";
import { PlayPurchaseError } from "@/lib/billing/play-purchase";
import { serverPlayDelivery } from "@/lib/billing/play-server";
import { creditStoreError } from "@/lib/credits/store-http";
import { StoreCreditError } from "@/lib/credits/store-contracts";
import { CreditError } from "@/lib/credits/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

// Android's /api/billing/verify. The app sends what Play Billing gave it — the
// product id and the opaque purchaseToken — and the server asks Google what
// that token is before granting anything (lib/billing/play-delivery.ts).
// Sent after a purchase, and again on every launch for any purchase Play still
// lists as unacknowledged, so a crash between paying and granting heals itself.
export async function POST(req: Request) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });

  let body: { productId?: unknown; purchaseToken?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid body" }, { status: 400, headers }); }
  const productId = typeof body.productId === "string" && body.productId.length <= 100 ? body.productId : null;
  const token = typeof body.purchaseToken === "string" && body.purchaseToken.length > 0 && body.purchaseToken.length <= 4096
    ? body.purchaseToken : null;
  if (!productId || !token) return NextResponse.json({ error: "productId and purchaseToken required" }, { status: 400, headers });

  let result;
  try {
    result = await deliverPlayPurchase(serverPlayDelivery(), userId, productId, token);
  } catch (error) {
    if (error instanceof PlayPurchaseError) {
      // Pending is not a failure: the app says so and waits for Play to tell it.
      if (error.code === "purchase_pending") return NextResponse.json({ state: "pending" }, { status: 202, headers });
      const status = error.code === "purchase_account_mismatch" ? 403 : error.code === "purchase_not_active" ? 409 : 400;
      return NextResponse.json({ error: error.code }, { status, headers });
    }
    if (error instanceof PlayPurchaseNotFound) return NextResponse.json({ error: "invalid_purchase" }, { status: 400, headers });
    if (error instanceof StoreCreditError || error instanceof CreditError) return creditStoreError(error);
    if (error instanceof PlayConfigurationError) {
      console.error("[billing/play/verify] not configured", error.message);
      return NextResponse.json({ error: "billing not configured" }, { status: 503, headers });
    }
    console.error("[billing/play/verify] failed", error);
    return NextResponse.json({ error: "billing unavailable" }, { status: 503, headers });
  }

  if (result.kind === "credits") return NextResponse.json({ ...result.delivery, acknowledged: result.acknowledged }, { headers });

  switch (result.status) {
    case "account_mismatch":
      return NextResponse.json({ error: "purchase belongs to another account" }, { status: 403, headers });
    case "already_bound":
    case "unbound_legacy":
      return NextResponse.json({ error: "purchase already linked" }, { status: 409, headers });
    case "already_owned":
      // Left unacknowledged on purpose: Google refunds it within three days.
      console.warn("[billing/play/verify] duplicate lifetime purchase", userId);
      return NextResponse.json({ error: "lifetime already owned" }, { status: 409, headers });
    default:
      return NextResponse.json(
        { lifetime: result.status === "revoke" || result.status === "ignore" ? "revoked" : "active", state: result.status },
        { headers },
      );
  }
}
