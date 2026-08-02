import "server-only";
import { atlasModerationThresholds, runAtlasImageModeration, runAtlasTextModeration } from "@/lib/atlas/moderation";
import { processAvatarImage, pruneAvatarImages, uploadAvatarImage } from "@/lib/avatar-storage";
import { getProfile, updateProfile } from "@/lib/users-db";
import { getAtlasAuthor } from "@/lib/atlas-db";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createProfileEditModule } from "./profile-edit-core";

export const profileEdit = createProfileEditModule({
  moderateText(value) {
    return runAtlasTextModeration([value]);
  },
  async processImage(bytes) {
    return processAvatarImage(Buffer.from(bytes));
  },
  async moderateImage(bytes) {
    const moderation = await runAtlasImageModeration(Buffer.from(bytes));
    if (moderation.degraded) return "unavailable";
    const { soft } = atlasModerationThresholds();
    const unsafe = moderation.hits.some((hit) => hit.category !== "face" && hit.score >= soft);
    return moderation.verdict === "rejected" || unsafe ? "rejected" : "accepted";
  },
  async uploadImage(userId, bytes) {
    return uploadAvatarImage(userId, Buffer.from(bytes));
  },
  persist: updateProfile,
  async read(userId) {
    const profile = await getProfile(userId);
    if (!profile) return null;
    const row = await getAtlasAuthor(profile.username);
    if (!row) return null;
    return {
      username: row.username,
      nickname: row.nickname,
      avatar: row.avatar,
      bio: row.bio,
      joinedAt: row.joined_at,
      publishedCount: row.published_count,
      saveCount: row.save_count,
    };
  },
  async mirror(userId, identity) {
    const admin = createServiceRoleClient();
    const { data: existing } = await admin.auth.admin.getUserById(userId);
    const previous = (existing?.user?.user_metadata ?? {}) as Record<string, unknown>;
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...previous,
        nickname: identity.displayName === identity.handle ? null : identity.displayName,
        avatar: identity.avatar,
      },
    });
  },
  cleanupImages: pruneAvatarImages,
  reportRepairableFailure(kind, error) {
    console.error(`[users/profile] ${kind} repair failed`, error);
  },
});
