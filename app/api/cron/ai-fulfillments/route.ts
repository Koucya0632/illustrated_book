import { creditRecoveryEnvironments } from "@/lib/credits/policy";
import { serverFulfillments, serverFulfillmentRunner } from "@/lib/ai-operations/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "worker_unavailable" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (process.env.AI_CREDITS_WORKER_ENABLED !== "true") return Response.json({ status: "disabled" });
  try {
    const environments = creditRecoveryEnvironments(), service = serverFulfillments();
    for (const environment of environments) {
      const work = await service.scan(environment);
      if (!work.length) continue;
      const outcome = await serverFulfillmentRunner(service)({ userId: work[0].user_id, environment }, work[0].id);
      return Response.json({ operationId: work[0].id, outcome });
    }
    return Response.json({ status: "idle" });
  } catch {
    console.error("[ai-fulfillments] worker failed; persisted work remains recoverable");
    return Response.json({ error: "worker_unavailable" }, { status: 503 });
  }
}
