import { getSql } from "@/lib/db";
import { creditConfig, creditReviewUsers, userCreditConfig } from "@/lib/credits/policy";
import { createCreditWallet } from "@/lib/credits/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const headers = { "Cache-Control": "private, no-store" };
  if (!secret) return Response.json({ error: "worker_unavailable" }, { status: 503, headers });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  try {
    const config = creditConfig();
    const reviewUsers = creditReviewUsers();
    const publicEnabled = config.mode === "live" && config.monthlyEnabled;
    if (!publicEnabled && !reviewUsers.length) return Response.json({ status: "disabled" }, { headers });
    const sql = getSql();
    if (!sql) throw new Error("database unavailable");
    const wallet = createCreditWallet(sql);
    const accounts = publicEnabled ? await wallet.monthlyAccounts(config, 100, reviewUsers) : [];
    const userIds = [...new Set([...accounts.map(account => String(account.user_id)), ...reviewUsers])];
    let updated = 0, pending = 0;
    for (const userId of userIds) {
      try {
        await wallet.readWallet({ userId, environment: userCreditConfig(userId).environment });
        updated++;
      } catch { pending++; }
    }
    return Response.json({ updated, pending, batchLimit: 100 }, { headers });
  } catch {
    console.error("[credit-monthly] refresh failed; durable benefits remain retryable");
    return Response.json({ error: "worker_unavailable" }, { status: 503, headers });
  }
}
