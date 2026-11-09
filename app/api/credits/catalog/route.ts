import { getCurrentUserIdFast } from "@/lib/current-user";
import { getSql } from "@/lib/db";
import { userCreditConfig, effectiveCreditPolicy, trialActive } from "@/lib/credits/policy";
import { isCreditAccount } from "@/lib/credits/legacy-guard";
import { CREDIT_PACKS, CREDIT_CATALOG_VERSION } from "@/lib/credits/store-contracts";

export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const now = new Date();
    const userId = await getCurrentUserIdFast(), config = userCreditConfig(userId ?? undefined), sql = getSql();
    const enrolled = userId ? await isCreditAccount(sql, userId, config) : false;
    const [holding] = userId && enrolled && sql ? await sql`SELECT EXISTS (SELECT 1 FROM user_lifetime_entitlements
      WHERE user_id = ${userId} AND revoked_at IS NULL) AS live` : [];
    const purchaseEnabled = enrolled && Boolean(holding?.live) && config.mode === "live" &&
      process.env.CREDITS_PURCHASE_ENABLED === "true" && process.env.CREDITS_STORE_PROCESSING_ENABLED === "true";
    return Response.json({ billingMode: enrolled ? "credits" : "legacy", environment: config.environment,
      purchaseEnabled, proNewPurchaseEnabled: !enrolled && process.env.PRO_NEW_PURCHASE_ENABLED === "true",
      operationsEnabled: enrolled && config.mode === "live" && process.env.AI_CREDITS_OPERATIONS_ENABLED === "true" &&
        process.env.AI_CREDITS_WORKER_ENABLED === "true" && Boolean(process.env.CRON_SECRET),
      monthlyEnabled: enrolled && Boolean(holding?.live) && config.mode === "live" && config.monthlyEnabled,
      monthlyDelivery: "automatic_reset", monthlyCarryover: false, checkInExpires: false,
      checkInEnabled: enrolled && Boolean(holding?.live) && config.mode === "live" && config.checkInEnabled,
      // Free accounts hold 試用點數 only: no check-in and no point packs (both need a lifetime).
      trialEnabled: config.mode === "live" && trialActive(config, now),
      policy: effectiveCreditPolicy(config, now), catalogVersion: CREDIT_CATALOG_VERSION,
      packs: purchaseEnabled ? Object.entries(CREDIT_PACKS).map(([productId, points]) => ({ productId, points })) : [],
    }, { headers });
  } catch { return Response.json({ error: "credits_unavailable" }, { status: 503, headers }); }
}
