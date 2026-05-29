// Selectable avatars reuse the mascot's cat poses (PNGs at
// /public/mascot/tuji-{pose}.png). Shared by the picker UI, the profile API
// validation, and the stored avatar type. Same string set as Mascot's
// MascotPose, so a value here can be passed straight to <Mascot pose=…>.
export const AVATAR_POSES = ["face", "peek", "wave", "cheer", "sleep", "think"] as const;

export type AvatarPose = (typeof AVATAR_POSES)[number];

export const DEFAULT_AVATAR: AvatarPose = "face";

export function isAvatarPose(v: unknown): v is AvatarPose {
  return typeof v === "string" && (AVATAR_POSES as readonly string[]).includes(v);
}
