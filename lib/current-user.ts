// Server-side helper: read the currently-authenticated Supabase user from
// the request cookies. Used by Server Components, Route Handlers, etc.

import "server-only";
import { createClient } from "./supabase/server";
import {
  getFavorites,
  getLearned,
  getProfile,
  type ProfileRow,
} from "./users-db";
import { DEFAULT_AVATAR, isAvatarPose, type AvatarPose } from "./avatars";

export interface CurrentUser {
  id: string;          // UUID
  username: string;
  nickname: string | null; // editable display name; null → use username
  avatar: AvatarPose;
  email: string;
  createdAt: string;
}

function toCurrent(p: ProfileRow): CurrentUser {
  return {
    id: p.id,
    username: p.username,
    nickname: p.nickname,
    avatar: isAvatarPose(p.avatar) ? p.avatar : DEFAULT_AVATAR,
    email: p.email,
    createdAt: p.created_at,
  };
}

export async function getCurrentUserId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const id = await getCurrentUserId();
  if (!id) return null;
  const p = await getProfile(id);
  return p ? toCurrent(p) : null;
}

export async function getCurrentUserBundle(): Promise<{
  user: CurrentUser;
  favorites: string[];
  learned: string[];
} | null> {
  const id = await getCurrentUserId();
  if (!id) return null;
  const [p, favorites, learned] = await Promise.all([
    getProfile(id),
    getFavorites(id),
    getLearned(id),
  ]);
  if (!p) return null;
  return { user: toCurrent(p), favorites, learned };
}
