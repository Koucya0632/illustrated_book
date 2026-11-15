// The one 檢舉 handler behind the three report routes (item, 合集, author).
//
// Auth, body, the per-account daily cap and the moderation notice are the same
// for all three; what a report does is the publication lifecycle's
// (`fileReport`). The reason list is lib/atlas/report-reasons.ts.

import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUserId } from "../current-user";
import { getSql } from "../db";
import { hitRateLimit } from "../ratelimit";
import { adminReportsUrl, notifyModeration } from "../notify";
import { atlasPublication } from "./publication-live";
import type { ReportSubject } from "./publication";
import { reportReason } from "./report-reasons";

const PRIVATE = { "Cache-Control": "private, no-store" };

export async function handleReport(req: Request, subject: ReportSubject): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!getSql()) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  let body: { reason?: unknown; detail?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason : "";
  if (!reportReason(reason)) return NextResponse.json({ error: "invalid reason" }, { status: 400 });
  const detail = typeof body.detail === "string" && body.detail.trim() ? body.detail.trim().slice(0, 1000) : null;

  // The cap is on how much moderation work one account can generate, across
  // every kind of report.
  const limit = await hitRateLimit({ bucket: `atlas-report:user:${userId}`, windowSeconds: 86_400, limit: 30 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "檢舉次數過多，請稍後再試。" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const filed = await atlasPublication().fileReport({ subject, reporterUserId: userId, reason, detail });
  if (!filed.ok) {
    return filed.reason === "not_found"
      ? NextResponse.json({ error: "not found" }, { status: 404 })
      : NextResponse.json({ error: "invalid reason" }, { status: 400 });
  }

  if (!filed.already) {
    const kind =
      filed.target === "collection" ? "合集" : filed.target === "author" ? "作者身分" : filed.target === "item_spot" ? "景點上的項目" : "項目";
    const headline =
      filed.target === "author"
        ? "⚠️ 作者身分檢舉（不會自動處理，需人工判斷）"
        : filed.escalated
          ? `🚨 ${kind}檢舉（已自動下架）`
          : `⚠️ ${kind}檢舉`;
    await notifyModeration(
      [
        headline,
        `${kind}：${filed.name} (${filed.slug})${filed.target === "item_spot" && filed.spotId ? `，景點：${filed.spotId}` : ""}`,
        `原因：${reason}${detail ? ` — ${detail}` : ""}`,
        adminReportsUrl(),
      ].join("\n"),
    );
  }

  return NextResponse.json({ ok: true, already: filed.already }, { headers: PRIVATE });
}
