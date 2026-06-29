import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { submitAtlasItemForReview } from "@/lib/atlas-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invalidId(id: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const item = await submitAtlasItemForReview(userId, params.id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(
    { item },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
