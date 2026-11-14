import { NextResponse } from "next/server";
import { isAtlasItemLocked } from "@/lib/atlas/entitlement";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { deleteAtlasItemCascade, getAtlasItem } from "@/lib/atlas-db";
import {
  removeAtlasPrivateObjects,
  removeAtlasPublicObjects,
} from "@/lib/atlas/storage";
import { isUuid } from "@/lib/http/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const item = await getAtlasItem(userId, params.id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  const locked = await isAtlasItemLocked(userId, item.id);
  return NextResponse.json({ item, locked }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

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
