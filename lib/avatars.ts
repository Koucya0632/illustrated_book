/** The only built-in profile avatar. Everything else must be an owned photo. */
export const DEFAULT_AVATAR = "face" as const;

export const AVATAR_BUCKET = "user-avatars";

export function isAvatarImage(v: unknown): v is string {
  if (typeof v !== "string") return false;
  try {
    const url = new URL(v);
    return url.protocol === "https:" && url.pathname.includes(`/storage/v1/object/public/${AVATAR_BUCKET}/`);
  } catch {
    return false;
  }
}

/** Canonical public avatar projection: an owned photo or the one black cat. */
export function publicAvatar(v: unknown): string {
  return isAvatarImage(v) ? v : DEFAULT_AVATAR;
}
