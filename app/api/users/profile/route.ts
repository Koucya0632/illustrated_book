import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { profileEdit } from "@/lib/profile/live-profile-edit";
import { ProfileEditError, type ProfileEditCommand } from "@/lib/profile/profile-edit-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function commandFrom(req: Request): Promise<ProfileEditCommand> {
  if (!req.headers.get("content-type")?.includes("multipart/form-data")) {
    throw new ProfileEditError("invalid_body", "請更新 App 後再編輯個人資料。", 415);
  }
  const form = await req.formData();
  const image = form.get("image");
  return {
    nickname: form.get("nickname"),
    bio: form.get("bio"),
    avatar: form.has("avatar") ? form.get("avatar") : undefined,
    image:
      image instanceof File && image.size > 0
        ? {
            bytes: new Uint8Array(await image.arrayBuffer()),
            mimeType: image.type,
            size: image.size,
          }
        : undefined,
  };
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(await profileEdit.edit(userId, await commandFrom(req)));
  } catch (error) {
    if (error instanceof ProfileEditError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }
    console.error("[users/profile] edit failed", error);
    return NextResponse.json(
      { error: "profile_edit_failed", message: "目前無法儲存個人資料，請稍後再試。" },
      { status: 500 },
    );
  }
}
