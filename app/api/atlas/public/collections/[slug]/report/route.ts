// 檢舉一個公開合集 — its title, 簡介 and 頭像 are public UGC in their own right,
// separate from the items it curates.
//
// Same shape as the item report (auth, reason whitelist, per-user daily cap,
// one report per reporter) and the same escalation, because a collection has a
// `review_status` too: enough reports pulls it back for a human and hides it
// meanwhile.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSql } from "@/lib/db";
import {
  createAtlasReport,
  getPublicCollectionRef,
  maybeEscalateCollectionReport,
  type AtlasReportReason,
} from "@/lib/atlas-db";
import { hitRateLimit } from "@/lib/ratelimit";
import { adminReportsUrl, notifyModeration } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REASONS = new Set<AtlasReportReason>([
  "spam",
  "inappropriate",
  "copyright",
  "wrong",
  "other",
]);

export async function POST(
  req: Request,
  { params }: { params: { slug: string } },
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!getSql()) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  const slug = params.slug.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: { reason?: unknown; detail?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason : "";
  if (!REASONS.has(reason as AtlasReportReason)) {
    return NextResponse.json({ error: "invalid reason" }, { status: 400 });
  }
  const detail =
    typeof body.detail === "string" && body.detail.trim()
      ? body.detail.trim().slice(0, 1000)
      : null;

  // Shares the item report's bucket: the cap is on how much moderation work one
  // account can generate, not on any single kind of report.
  const limit = await hitRateLimit({
    bucket: `atlas-report:user:${userId}`,
    windowSeconds: 86_400,
    limit: 30,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "檢舉次數過多，請稍後再試。" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const collection = await getPublicCollectionRef(slug);
  if (!collection) return NextResponse.json({ error: "not found" }, { status: 404 });

  const result = await createAtlasReport({
    targetType: "collection",
    targetId: collection.id,
    publicItemId: null,
    sourceItemId: null,
    slug,
    reporterUserId: userId,
    reason: reason as AtlasReportReason,
    detail,
  });

  if (!result.already) {
    const escalated = await maybeEscalateCollectionReport({
      collectionId: collection.id,
      reason,
    });
    await notifyModeration(
      [
        escalated ? "🚨 合集檢舉（已自動下架）" : "⚠️ 合集檢舉",
        `合集：${collection.title} (${slug})`,
        `原因：${reason}${detail ? ` — ${detail}` : ""}`,
        adminReportsUrl(),
      ].join("\n"),
    );
  }

  return NextResponse.json(
    { ok: true, already: result.already },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
