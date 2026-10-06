import { getSql } from "@/lib/db";
import { creditRecoveryEnvironments } from "@/lib/credits/policy";
import { createCreditUploads } from "@/lib/ai-operations/uploads";
import { removeAtlasPrivateObjects } from "@/lib/atlas/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "worker_unavailable" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (process.env.AI_CREDITS_WORKER_ENABLED !== "true") return Response.json({ status: "disabled" });
  try {
    const sql = getSql();
    if (!sql) throw new Error("database_unavailable");
    const service = createCreditUploads(sql);
    let cleaned = 0;
    for (const environment of creditRecoveryEnvironments()) {
      const work = await service.scan(environment);
      for (const row of work) {
      const a = { userId: row.user_id, environment };
      const paths = await service.cleanup(a, row.id);
      if (paths) { await removeAtlasPrivateObjects(paths); await service.finishCleanup(a, row.id); cleaned++; }
      }
    }
    return Response.json({ cleaned });
  } catch {
    console.error("[ai-image-cleanup] cleanup failed; durable work remains pending");
    return Response.json({ error: "worker_unavailable" }, { status: 503 });
  }
}
