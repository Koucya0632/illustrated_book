// 檢舉一個作者身分 — the 暱稱, 簽名 and 頭像 on a public author profile.
//
// **No auto-escalation, by design.** An author identity has no review status to
// flip, and hiding someone's whole presence is a different act from hiding one
// thing they made: three coordinated reports must not be able to erase a person
// from 物見. These wait for a human, which is exactly why the webhook matters
// here more than anywhere else.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSql } from "@/lib/db";
import {
  createAtlasReport,
  getAuthorIdByHandle,
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
  { params }: { params: { username: string } },
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!getSql()) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  const handle = params.username.trim();
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(handle)) {
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

  const authorId = await getAuthorIdByHandle(handle);
  if (!authorId) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Reporting yourself is a no-op, not an error worth explaining.
  if (authorId === userId) {
    return NextResponse.json({ ok: true, already: true }, { status: 200 });
  }

  const result = await createAtlasReport({
    targetType: "author",
    targetId: authorId,
    publicItemId: null,
    sourceItemId: null,
    slug: handle,
    reporterUserId: userId,
    reason: reason as AtlasReportReason,
    detail,
  });

  if (!result.already) {
    await notifyModeration(
      [
        "⚠️ 作者身分檢舉（不會自動處理，需人工判斷）",
        `作者：${handle}`,
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
