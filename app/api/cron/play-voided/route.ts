import { sweepPlayVoided } from "@/lib/billing/play-delivery";
import { serverPlayVoided } from "@/lib/billing/play-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Google keeps voided purchases for 30 days; reading the whole window daily is idempotent. */
const WINDOW_MS = 30 * 86_400_000 - 3_600_000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "worker_unavailable" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) return Response.json({ status: "disabled" });
  try {
    return Response.json(await sweepPlayVoided(serverPlayVoided(), new Date(Date.now() - WINDOW_MS)));
  } catch (error) {
    console.error("[play-voided] sweep failed; the next run re-reads the same window", error);
    return Response.json({ error: "worker_unavailable" }, { status: 503 });
  }
}
