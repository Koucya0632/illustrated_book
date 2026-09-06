// Server-side helper: read the currently-authenticated Supabase user from
// the request cookies. Used by Server Components, Route Handlers, etc.

import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "./supabase/server";
import {
  getFavorites,
  getLearned,
  getProfile,
  getSettings,
  type ProfileRow,
} from "./users-db";
import { publicAvatar } from "./avatars";
import { USER_ID_HEADER } from "./supabase/middleware";

export interface CurrentUser {
  id: string;          // UUID
  username: string;
  nickname: string | null; // editable display name; null → use username
  avatar: string;
  email: string;
  createdAt: string;
  /** Public 簽名 shown on the author profile. */
  bio: string | null;
}

function toCurrent(p: ProfileRow): CurrentUser {
  return {
    id: p.id,
    username: p.username,
    nickname: p.nickname,
    avatar: publicAvatar(p.avatar),
    email: p.email,
    createdAt: p.created_at,
    bio: p.bio,
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
// Wrapped in React `cache()` so multiple call sites within a single
// request (route handler + getProfile join + middleware-ish helpers)
// dedupe to one lookup. The cache scope is per request, so different
// requests still resolve independently.
export const getCurrentUserId = cache(async (): Promise<string | null> => {
  const headerId = (await headers()).get(USER_ID_HEADER);
  if (headerId) return headerId;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
});

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

// React `cache()` for the same reason `getCurrentUserId` has it: the root
// layout and a route layout both need the bundle within one request, and this
// does four queries. Without memoization, moving `WordsProvider` out of the
// root layout would have doubled them on every catalogue route.
export const getCurrentUserBundle = cache(async (): Promise<{
  user: CurrentUser;
  favorites: string[];
  learned: string[];
} | null> => {
  const id = await getCurrentUserId();
  if (!id) return null;
  const [p, favorites, settings] = await Promise.all([
    getProfile(id),
    getFavorites(id),
    getSettings(id),
  ]);
  if (!p) return null;
  const learned = await getLearned(
    id,
    settings.learningDirection === "zh-ja" ? "ja" : "en",
  );
  return { user: toCurrent(p), favorites, learned };
});
