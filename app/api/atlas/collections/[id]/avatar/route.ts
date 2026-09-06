import { NextResponse } from "next/server";
import { collectionAvatar } from "@/lib/atlas/live-collection-avatar";
import {
  CollectionAvatarError,
  type CollectionAvatarImage,
} from "@/lib/atlas/collection-avatar-core";
import { getCurrentUserId } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function validId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

async function imageFrom(req: Request): Promise<CollectionAvatarImage> {
  if (!req.headers.get("content-type")?.includes("multipart/form-data")) {
    throw new CollectionAvatarError("invalid_body", "請更新 App 後再試", 415);
  }
  const form = await req.formData();
  const image = form.get("image");
  if (!(image instanceof File) || image.size === 0) {
    throw new CollectionAvatarError("invalid_image", "請選擇一張圖片");
  }
  return {
    bytes: new Uint8Array(await image.arrayBuffer()),
    mimeType: image.type,
    size: image.size,
  };
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!validId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const result = await collectionAvatar.replace(userId, params.id, await imageFrom(req));
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof CollectionAvatarError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    console.error("[atlas/collections/avatar] replace failed", error);
    return NextResponse.json(
      { error: "avatar_update_failed", message: "集合頭像更新失敗，請稍後再試" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
