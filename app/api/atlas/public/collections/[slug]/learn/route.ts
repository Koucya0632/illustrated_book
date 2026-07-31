// Batch-add the unlocked collection's remaining public items to study.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSql } from "@/lib/db";
import { livePublicCollectionModule } from "@/lib/atlas/public-collection-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeSlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  return /^[a-z0-9-]{1,80}$/.test(slug) ? slug : null;
}

export async function POST(
  _req: Request,
  { params }: { params: { slug: string } },
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!getSql()) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  const slug = normalizeSlug(params.slug);
  if (!slug) return NextResponse.json({ error: "not found" }, { status: 404 });
  const outcome = await livePublicCollectionModule.learnRemaining({ slug, userId });
  if (!outcome.ok) {
    if (outcome.error === "notFound") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (outcome.error === "locked") {
      return NextResponse.json(
        { error: "collection_locked", message: "請先收藏合集。" },
        { status: 403, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (outcome.error === "rateLimited") {
      return NextResponse.json(
        { error: "rate_limited", message: "操作過於頻繁，請稍後再試。" },
        {
          status: 429,
          headers: { "Retry-After": String(outcome.retryAfterSeconds) },
        },
      );
    }
    return NextResponse.json(
      {
        error: "save_limit",
        message: `學習項目已達上限（${outcome.limit}），移除一些後再加入。`,
        limit: outcome.limit,
        usage: outcome.usage,
      },
      { status: 429, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      addedCount: outcome.value.addedCount,
      learningCount: outcome.value.learningCount,
      totalCount: outcome.value.totalCount,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
