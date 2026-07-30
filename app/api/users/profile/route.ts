// The one profile endpoint: 暱稱, 簽名, 頭像.
//
// It used to have a sibling — /api/users/public-author — because the two edited
// the same columns with different meanings: this one wrote a *private* in-app
// greeting, that one *published* an identity and needed consent for it. That
// split is gone. The handle is now a machine-minted UID nobody can edit, so
// there is no private field left to accidentally publish, and everything a user
// types here goes into a field that says it is public.
//
// The 簽名 is text-gated on write for the same reason a 合集 title is: it is
// author-supplied text on a public page.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { updateProfile } from "@/lib/users-db";
import { isAvatarPose } from "@/lib/avatars";
import { PUBLIC_BIO_MAX } from "@/lib/public-author";
import { runAtlasTextModeration } from "@/lib/atlas/moderation";
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
  const { nickname, avatar, bio } = (body ?? {}) as {
    nickname?: unknown;
    avatar?: unknown;
    bio?: unknown;
  };

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

  // Avatar is optional: only persist a pose when a valid one is explicitly
  // sent, so a nickname-only update never resets the saved one.
  const pose = isAvatarPose(avatar) ? avatar : undefined;

  // `undefined` means the client isn't managing the 簽名 on this call and it is
  // left as-is; an empty string is a deliberate clear.
  let nextBio: string | null | undefined;
  if (bio !== undefined) {
    if (typeof bio !== "string") {
      return NextResponse.json({ error: "invalid bio" }, { status: 400 });
    }
    const trimmedBio = bio.trim();
    if (trimmedBio.length > PUBLIC_BIO_MAX) {
      return NextResponse.json(
        { error: "invalid bio", message: `簽名最多 ${PUBLIC_BIO_MAX} 字。` },
        { status: 400 },
      );
    }
    // Refused outright rather than queued for a human. The gate only catches
    // links and personal information — both of which a 簽名 must not carry at
    // all — so there is no verdict a reviewer could reach that this cannot, and
    // it saves standing up a review surface for one line of text.
    const hits = runAtlasTextModeration([trimmedBio]);
    if (hits.length > 0) {
      const hasPii = hits.some((h) => h.category === "pii");
      return NextResponse.json(
        {
          error: "bio_rejected",
          message: hasPii
            ? "簽名不能包含個人資訊（電話、email、地址等）。"
            : "簽名不能包含網址或連結。",
        },
        { status: 400 },
      );
    }
    nextBio = trimmedBio === "" ? null : trimmedBio;
  }

  await updateProfile(userId, { nickname: nick, avatar: pose, bio: nextBio });

  // Mirror the display name (and pose, when changed) into Supabase
  // user_metadata so the client's SessionUser — which reads raw_user_meta_data
  // — reflects the change after a session refresh. Merge into existing metadata
  // so the system-assigned UID survives.
  try {
    const admin = createServiceRoleClient();
    const { data: existing } = await admin.auth.admin.getUserById(userId);
    const prevMeta = (existing?.user?.user_metadata ?? {}) as Record<string, unknown>;
    const meta: Record<string, unknown> = { ...prevMeta, nickname: nick };
    if (pose !== undefined) meta.avatar = pose;
    await admin.auth.admin.updateUserById(userId, { user_metadata: meta });
  } catch (e) {
    // Non-fatal: the profiles row is already updated; metadata catches up on
    // the next successful sync. Logged so it stays visible.
    console.error("[users/profile] metadata sync failed", e);
  }

  return NextResponse.json({
    ok: true,
    nickname: nick,
    avatar: pose ?? null,
    bio: nextBio ?? null,
  });
}
