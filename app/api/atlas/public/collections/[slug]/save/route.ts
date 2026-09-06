// Bookmark / unbookmark one public collection. This is deliberately separate
// from the public-item save route: a collection bookmark creates no SRS cards,
// consumes no saved-item quota, and never writes atlas_saves.

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

async function context(slugRaw: string) {
  const userId = await getCurrentUserId();
  if (!userId) return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (!getSql()) {
    return { response: NextResponse.json({ error: "database unavailable" }, { status: 503 }) };
  }
  const slug = normalizeSlug(slugRaw);
  if (!slug) return { response: NextResponse.json({ error: "not found" }, { status: 404 }) };
  return { userId, slug };
}

function privateJSON(saved: boolean, saveCount: number) {
  return NextResponse.json(
    { ok: true, saved, saveCount },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function GET(_req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const result = await context(params.slug);
  if ("response" in result) return result.response;
  const outcome = await livePublicCollectionModule.bookmarkState(result);
  if (!outcome.ok) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return privateJSON(outcome.value.saved, outcome.value.saveCount);
}

export async function POST(_req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const result = await context(params.slug);
  if ("response" in result) return result.response;
  const outcome = await livePublicCollectionModule.bookmark(result);
  if (!outcome.ok) {
    if (outcome.error === "notFound") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (outcome.error === "cannotSaveOwnCollection") {
      return NextResponse.json({ error: "cannot_save_own_collection" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "rate_limited", message: "操作過於頻繁，請稍後再試。" },
      {
        status: 429,
        headers: { "Retry-After": String(outcome.retryAfterSeconds) },
      },
    );
  }
  return privateJSON(outcome.value.saved, outcome.value.saveCount);
}

export async function DELETE(_req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const result = await context(params.slug);
  if ("response" in result) return result.response;
  const outcome = await livePublicCollectionModule.removeBookmark(result);
  if (!outcome.ok) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return privateJSON(outcome.value.saved, outcome.value.saveCount);
}
