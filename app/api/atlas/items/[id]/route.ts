import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { deleteAtlasItemCascade, getAtlasItem } from "@/lib/atlas-db";
import {
  removeAtlasPrivateObjects,
  removeAtlasPublicObjects,
} from "@/lib/atlas/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invalidId(id: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(id);
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const item = await getAtlasItem(userId, params.id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ item }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const paths = await deleteAtlasItemCascade(userId, params.id);
  if (!paths) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    await Promise.all([
      removeAtlasPrivateObjects(paths.privatePaths),
      removeAtlasPublicObjects(paths.publicPaths),
    ]);
  } catch (err) {
    console.error("[atlas/items/delete] storage cleanup failed", err);
    return NextResponse.json(
      { error: "deleted database rows but storage cleanup failed" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
