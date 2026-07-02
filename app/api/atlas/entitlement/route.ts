import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { getAtlasEntitlement } from "@/lib/atlas/entitlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tier + limits + current usage for the 自製圖鑑. The client mirrors this to
// gate capture UI and show remaining quota; the server re-checks on every write.
export async function GET() {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const snapshot = await getAtlasEntitlement(userId);
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
