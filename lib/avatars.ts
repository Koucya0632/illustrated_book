import { isPublicObjectUrl } from "@/lib/storage/public-objects";

/** The only built-in profile avatar. Everything else must be an owned photo. */
export const DEFAULT_AVATAR = "face" as const;

export const AVATAR_BUCKET = "user-avatars";

export function isAvatarImage(v: unknown): v is string {
  return isPublicObjectUrl(v, AVATAR_BUCKET);
}

/** Canonical public avatar projection: an owned photo or the one black cat. */
export function publicAvatar(v: unknown): string {
  return isAvatarImage(v) ? v : DEFAULT_AVATAR;
}
