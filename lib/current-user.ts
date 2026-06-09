// Server-side helper: read the currently-authenticated Supabase user from
// the request cookies. Used by Server Components, Route Handlers, etc.

import "server-only";
import { headers } from "next/headers";
import { createClient } from "./supabase/server";
import {
  getFavorites,
  getLearned,
  getProfile,
  type ProfileRow,
} from "./users-db";
import { DEFAULT_AVATAR, isAvatarPose, type AvatarPose } from "./avatars";
import { USER_ID_HEADER } from "./supabase/middleware";

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

/**
 * Read the current user id. Header-first so any caller (server component,
 * route handler, action) automatically picks up both auth paths:
 *
 *   - cookie path (web): middleware's `updateSupabaseSession` validates the
 *     session cookie and stamps `x-user-id`
 *   - Bearer path (mobile): same middleware validates `Authorization: Bearer`
 *     via service-role admin client and stamps `x-user-id`
 *
 * Falls back to a fresh `supabase.auth.getUser()` if the header is missing —
 * covers server components that bypassed the middleware matcher, local dev
 * edge cases, or future middleware refactors that stop setting the header.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const headerId = headers().get(USER_ID_HEADER);
  if (headerId) return headerId;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Deprecated alias kept for backwards compat with hot-path call sites.
 * `getCurrentUserId()` now does the same header-first lookup; prefer it
 * in new code.
 *
 * @deprecated use `getCurrentUserId()`
 */
export const getCurrentUserIdFast = getCurrentUserId;

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
