import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSql } from "@/lib/db";
import {
  createAtlasReport,
  getAtlasPublicItem,
  maybeEscalateAtlasReport,
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

export async function POST(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
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

  // Light per-user daily cap so the button can't be used to flood moderation.
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

  const item = await getAtlasPublicItem(slug);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  const result = await createAtlasReport({
    targetType: "item",
    targetId: item.id,
    publicItemId: item.id,
    sourceItemId: item.source_item_id ?? null,
    slug: item.public_slug,
    reporterUserId: userId,
    reason: reason as AtlasReportReason,
    detail,
  });

  // Only a new report can move the needle; a duplicate must not re-trigger.
  if (!result.already) {
    const escalated = await maybeEscalateAtlasReport({
      publicItemId: item.id,
      sourceItemId: item.source_item_id ?? null,
      reason,
    });
    // After escalation, so the message can say whether anything already
    // happened — an item that auto-hid needs a different kind of attention from
    // one still sitting live on the feed.
    await notifyModeration(
      [
        escalated ? "🚨 檢舉（已自動下架）" : "⚠️ 新檢舉",
        `項目：${item.lemma} (${item.public_slug})`,
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
