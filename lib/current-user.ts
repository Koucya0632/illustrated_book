import "server-only";
import { cookies } from "next/headers";
import { USER_COOKIE, verifyUserToken } from "./user-auth";
import {
  findById,
  getFavorites,
  getLearned,
  toPublic,
  type PublicUser,
} from "./users-db";

export async function getCurrentUserId(): Promise<number | null> {
  const c = cookies().get(USER_COOKIE)?.value;
  return verifyUserToken(c);
}

export async function getCurrentUser(): Promise<PublicUser | null> {
  const id = await getCurrentUserId();
  if (!id) return null;
  const row = await findById(id);
  return row ? toPublic(row) : null;
}

export async function getCurrentUserBundle(): Promise<{
  user: PublicUser;
  favorites: string[];
  learned: string[];
} | null> {
  const id = await getCurrentUserId();
  if (!id) return null;
  const [row, favorites, learned] = await Promise.all([
    findById(id),
    getFavorites(id),
    getLearned(id),
  ]);
  if (!row) return null;
  return { user: toPublic(row), favorites, learned };
}
