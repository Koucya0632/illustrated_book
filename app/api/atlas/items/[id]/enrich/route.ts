import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import {
  getAtlasItem,
  markAtlasItemBackfillFailed,
  updateAtlasItemEnrichment,
} from "@/lib/atlas-db";
import { enrichAtlasItem } from "@/lib/atlas/enrich";
import { shouldEnrichAtlasItem } from "@/lib/atlas/enrich-policy";
import { checkAtlasAiBackstops, clientIpHash } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function invalidId(id: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

// Generate AI enrichment for one custom atlas item.
//
// Idempotent for real, which it previously only claimed to be: it re-ran the
// whole paid pass (3-4 model calls) on every POST, with no quota, no burst
// limit and no daily cap. shouldEnrichAtlasItem is the one place that decides
// whether an item may still cost money; a repeat POST for an item that is
// already filled now returns 200 without touching a model. See docs/adr/0011.
//
// The only legitimate caller is AtlasCaptureQueue's confirm→cards→enrich tail,
// exactly once per new item, so nothing real is turned away by this.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const item = await getAtlasItem(userId, params.id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Already enriched (or out of budget) — the work is done or will not be done.
  // Either way the caller's item is in its final state, so this is a success.
  if (!shouldEnrichAtlasItem(item)) {
    return NextResponse.json(
      { ok: true, enriched: false },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const backstop = await checkAtlasAiBackstops({ ipHash: clientIpHash(req) });
  if (!backstop.ok) {
    return NextResponse.json(
      { error: backstop.message ?? "rate limited" },
      {
        status: 429,
        headers: {
          "Cache-Control": "private, no-store",
          ...(backstop.retryAfterSeconds
            ? { "Retry-After": String(backstop.retryAfterSeconds) }
            : {}),
        },
      },
    );
  }

  try {
    const fields = await enrichAtlasItem(item);
    await updateAtlasItemEnrichment(userId, item.id, fields);
    return NextResponse.json(
      { ok: true, enriched: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "enrich failed";
    await markAtlasItemBackfillFailed(userId, item, message).catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
