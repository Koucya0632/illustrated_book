import { serverCreditStore } from "@/lib/credits/store-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "worker_unavailable" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (process.env.CREDITS_STORE_PROCESSING_ENABLED !== "true") return Response.json({ status: "disabled" });
  try {
    const { store } = serverCreditStore(), work = await store.scan();
    let processed = 0, pending = 0;
    for (const row of work) {
      try { await store.process(row.environment, row.notification_id); processed++; }
      catch { pending++; }
    }
    return Response.json({ processed, pending });
  } catch {
    console.error("[credit-store-notifications] database unavailable; persisted work retained");
    return Response.json({ error: "worker_unavailable" }, { status: 503 });
  }
}
