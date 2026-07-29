// The 公開作者身分 consent endpoint.
//
// Separate from /api/users/profile on purpose: that route edits a private
// in-app greeting, this one publishes an identity. Same two columns, different
// meaning — and it is the meaning that decides whether a name reaches the
// community wall. Every publish path checks the stamp this route writes.
//
// GET returns what the user would be published as, so the client can decide
// between "show the one-time setup" and "publish now".

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import {
  PUBLIC_IDENTITY_COOLDOWN_DAYS,
  getProfile,
  publicIdentityRenameState,
  setPublicAuthorIdentity,
} from "@/lib/users-db";
import { PUBLIC_HANDLE_MAX, isValidPublicHandle } from "@/lib/public-author";
import { isAvatarPose } from "@/lib/avatars";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DISPLAY_NAME_MAX = 20;

const noStore = { "Cache-Control": "private, no-store" };

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const profile = await getProfile(userId);
  if (!profile) return NextResponse.json({ error: "not found" }, { status: 404 });

  const confirmed = profile.public_author_confirmed_at !== null;
  // Reported so the sheet can disable the fields and say when they unlock,
  // rather than letting someone retype their name and only then be refused.
  const rename = await publicIdentityRenameState(userId);
  return NextResponse.json(
    {
      confirmed,
      confirmedAt: profile.public_author_confirmed_at,
      // Suggestions for the setup screen, NOT a public payload: the client
      // shows them in an editable field the user must actively accept.
      handle: profile.username,
      displayName: profile.nickname ?? "",
      avatar: profile.avatar,
      canChange: rename.allowed,
      nextChangeAt: rename.nextChangeAt,
      cooldownDays: PUBLIC_IDENTITY_COOLDOWN_DAYS,
    },
    { headers: noStore },
  );
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { handle, displayName, avatar } = (body ?? {}) as {
    handle?: unknown;
    displayName?: unknown;
    avatar?: unknown;
  };

  const trimmedHandle = typeof handle === "string" ? handle.trim() : "";
  if (!isValidPublicHandle(trimmedHandle)) {
    return NextResponse.json(
      { error: "invalid handle", message: `帳號代碼只能用英數字、_ . -，最多 ${PUBLIC_HANDLE_MAX} 字。` },
      { status: 400, headers: noStore },
    );
  }

  const trimmedName = typeof displayName === "string" ? displayName.trim() : "";
  if (trimmedName === "" || trimmedName.length > DISPLAY_NAME_MAX) {
    return NextResponse.json(
      { error: "invalid displayName", message: `顯示名稱不能空白，最多 ${DISPLAY_NAME_MAX} 字。` },
      { status: 400, headers: noStore },
    );
  }

  if (avatar !== undefined && !isAvatarPose(avatar)) {
    return NextResponse.json({ error: "invalid avatar" }, { status: 400, headers: noStore });
  }
  const pose = isAvatarPose(avatar) ? avatar : undefined;

  const result = await setPublicAuthorIdentity(userId, {
    handle: trimmedHandle,
    displayName: trimmedName,
    avatar: pose,
  });
  if (!result.ok) {
    if (result.reason === "cooldown") {
      return NextResponse.json(
        {
          error: "rename_cooldown",
          message: `公開身分每 ${PUBLIC_IDENTITY_COOLDOWN_DAYS} 天只能修改一次。`,
          nextChangeAt: result.nextChangeAt,
        },
        { status: 429, headers: noStore },
      );
    }
    return NextResponse.json(
      { error: "handle_taken", message: "這個帳號代碼已經有人用了。" },
      { status: 409, headers: noStore },
    );
  }

  // Mirror into Supabase user_metadata: the client's SessionUser reads
  // `username`/`nickname` from there, so skipping this leaves the app showing
  // the pre-confirmation handle until the next full profile fetch.
  try {
    const admin = createServiceRoleClient();
    const { data: existing } = await admin.auth.admin.getUserById(userId);
    const prevMeta = (existing?.user?.user_metadata ?? {}) as Record<string, unknown>;
    const meta: Record<string, unknown> = {
      ...prevMeta,
      username: trimmedHandle,
      nickname: trimmedName,
    };
    if (pose !== undefined) meta.avatar = pose;
    await admin.auth.admin.updateUserById(userId, { user_metadata: meta });
  } catch (e) {
    // Non-fatal: profiles is the authority and is already written.
    console.error("[users/public-author] metadata sync failed", e);
  }

  return NextResponse.json(
    { ok: true, confirmed: true, handle: trimmedHandle, displayName: trimmedName },
    { headers: noStore },
  );
}
