import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { updateProfile } from "@/lib/users-db";
import { isAvatarPose } from "@/lib/avatars";
import { createServiceRoleClient } from "@/lib/supabase/server";

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

  // Avatar editing is currently disabled client-side; only persist a pose
  // when a valid one is explicitly sent, otherwise leave it untouched.
  const pose = isAvatarPose(avatar) ? avatar : undefined;
  await updateProfile(userId, { nickname: nick, avatar: pose });

  // Mirror the editable display name (and pose, when changed) into Supabase
  // user_metadata so the client's SessionUser — which reads
  // raw_user_meta_data — reflects the change after a session refresh. Merge
  // into existing metadata so the system-assigned `username` handle survives.
  try {
    const admin = createServiceRoleClient();
    const { data: existing } = await admin.auth.admin.getUserById(userId);
    const prevMeta = (existing?.user?.user_metadata ?? {}) as Record<string, unknown>;
    const meta: Record<string, unknown> = { ...prevMeta, nickname: nick };
    if (pose !== undefined) meta.avatar = pose;
    await admin.auth.admin.updateUserById(userId, { user_metadata: meta });
  } catch (e) {
    // Non-fatal: the profiles row is already updated; metadata will catch up
    // on the next successful sync. Log so it's visible in server logs.
    console.error("[users/profile] metadata sync failed", e);
  }

  return NextResponse.json({ ok: true, nickname: nick, avatar: pose ?? null });
}
