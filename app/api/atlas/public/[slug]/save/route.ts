// Save / unsave a community 圖鑑 item (docs/COMMUNITY_ATLAS_PLAN.md §4.1).
//
// This is the CONSUMPTION path. It writes to atlas_saves and never to
// user_atlas_items, so saving other people's photos cannot consume the user's
// creation slots (Free 3). The gate here reads savedItemsLimit, not
// atlasSlotsLimit — a Free user at their creation limit can still save.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSql } from "@/lib/db";
import {
  countAtlasSaves,
  getAtlasPublicItem,
  isAtlasPublicItemSaved,
  saveAtlasPublicItem,
  unsaveAtlasPublicItem,
} from "@/lib/atlas-db";
import { checkAtlasSaveCapacity } from "@/lib/atlas/entitlement";
import { hitRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeSlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  return /^[a-z0-9-]{1,80}$/.test(slug) ? slug : null;
}

export async function GET(_req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!getSql()) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  const slug = normalizeSlug(params.slug);
  if (!slug) return NextResponse.json({ error: "not found" }, { status: 404 });

  const item = await getAtlasPublicItem(slug);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [saved, saveCount] = await Promise.all([
    isAtlasPublicItemSaved(userId, item.id),
    countAtlasSaves(item.id),
  ]);

  return NextResponse.json(
    { ok: true, saved, saveCount },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(_req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!getSql()) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  const slug = normalizeSlug(params.slug);
  if (!slug) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Counter-inflation guard: cheap per-user cap on save churn.
  const limit = await hitRateLimit({
    bucket: `atlas-save:user:${userId}`,
    windowSeconds: 3600,
    limit: 300,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "操作過於頻繁，請稍後再試。" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const item = await getAtlasPublicItem(slug);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  const gate = await checkAtlasSaveCapacity(userId);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "save_limit", message: gate.message, limit: gate.limit, usage: gate.usage },
      { status: 429, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  await saveAtlasPublicItem(userId, item.id);
  const saveCount = await countAtlasSaves(item.id);

  return NextResponse.json(
    { ok: true, saved: true, saveCount },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function DELETE(_req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!getSql()) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  const slug = normalizeSlug(params.slug);
  if (!slug) return NextResponse.json({ error: "not found" }, { status: 404 });

  const item = await getAtlasPublicItem(slug);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  await unsaveAtlasPublicItem(userId, item.id);
  const saveCount = await countAtlasSaves(item.id);

  return NextResponse.json(
    { ok: true, saved: false, saveCount },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
