import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import {
  getAtlasItem,
  markAtlasItemBackfillFailed,
  updateAtlasItemEnrichment,
} from "@/lib/atlas-db";
import { enrichAtlasItem } from "@/lib/atlas/enrich";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function invalidId(id: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

// Generate (or regenerate) AI enrichment for one custom atlas item. Idempotent.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const item = await getAtlasItem(userId, params.id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const fields = await enrichAtlasItem(item);
    await updateAtlasItemEnrichment(userId, item.id, fields);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "enrich failed";
    await markAtlasItemBackfillFailed(userId, item.id, message).catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
