import { NextResponse } from "next/server";
import { cleanupOldAtlasRawResponses } from "@/lib/atlas-db";
import { getSql } from "@/lib/db";
import { cleanupOldRateLimitHits } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!getSql()) {
    return NextResponse.json(
      { error: "DATABASE_URL not configured" },
      { status: 503 },
    );
  }

  const startedAt = Date.now();
  try {
    const retentionDays = Number(process.env.ATLAS_RAW_RESPONSE_RETENTION_DAYS || 30);
    const cleanedRawResponses = await cleanupOldAtlasRawResponses(retentionDays);
    const cleanedRateLimitHits = await cleanupOldRateLimitHits();
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      retentionDays,
      cleanedRawResponses,
      cleanedRateLimitHits,
    });
  } catch (err) {
    console.error("[cron/atlas-cleanup] cleanup failed", err);
    return NextResponse.json(
      { error: "cleanup failed", message: String(err) },
      { status: 500 },
    );
  }
}
