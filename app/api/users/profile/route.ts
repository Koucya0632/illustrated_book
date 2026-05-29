import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { updateProfile } from "@/lib/users-db";
import { isAvatarPose, DEFAULT_AVATAR } from "@/lib/avatars";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NICKNAME_MAX = 20;

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { nickname, avatar } = (body ?? {}) as { nickname?: unknown; avatar?: unknown };

  if (avatar !== undefined && !isAvatarPose(avatar)) {
    return NextResponse.json({ error: "invalid avatar" }, { status: 400 });
  }
  let nick: string | null = null;
  if (typeof nickname === "string") {
    const trimmed = nickname.trim();
    if (trimmed.length > NICKNAME_MAX) {
      return NextResponse.json({ error: "nickname too long" }, { status: 400 });
    }
    nick = trimmed === "" ? null : trimmed;
  }

  const pose = isAvatarPose(avatar) ? avatar : DEFAULT_AVATAR;
  await updateProfile(userId, { nickname: nick, avatar: pose });
  return NextResponse.json({ ok: true, nickname: nick, avatar: pose });
}
