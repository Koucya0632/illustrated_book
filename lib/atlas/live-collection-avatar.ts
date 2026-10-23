import "server-only";
import { getOwnedAtlasCollection, updateAtlasCollectionAvatar } from "@/lib/atlas-db";
import { collectionAvatarRefused, runAtlasImageModeration } from "@/lib/atlas/moderation";
import {
  createCollectionAvatarSignedUrl,
  removeCollectionAvatar,
  uploadCollectionAvatar,
} from "@/lib/atlas/storage";
import { createCollectionAvatarModule } from "./collection-avatar-core";
import { processCollectionAvatarImage } from "./collection-avatar-image";

export const collectionAvatar = createCollectionAvatarModule({
  async readOwned(userId, collectionId) {
    const owned = await getOwnedAtlasCollection(collectionId, userId);
    if (!owned) return null;
    return {
      avatarPath: owned.collection.avatar_private_path,
      avatarColor: owned.collection.avatar_color,
    };
  },
  async processImage(bytes) {
    return processCollectionAvatarImage(bytes);
  },
  async moderateImage(bytes) {
    const moderation = await runAtlasImageModeration(Buffer.from(bytes));
    if (moderation.degraded) return "unavailable";
    if (moderation.verdict === "rejected" || collectionAvatarRefused(moderation.hits)) {
      // The reader only sees "pick another photo"; this is the one place that says why.
      console.warn("[atlas/collections/avatar] rejected", { verdict: moderation.verdict, hits: moderation.hits });
      return "rejected";
    }
    return "accepted";
  },
  async uploadImage(userId, collectionId, bytes) {
    return uploadCollectionAvatar(userId, collectionId, Buffer.from(bytes));
  },
  async persist(userId, collectionId, avatar) {
    return Boolean(
      await updateAtlasCollectionAvatar({
        id: collectionId,
        ownerUserId: userId,
        avatarPath: avatar.path,
        avatarColor: avatar.color,
      }),
    );
  },
  previewImage: createCollectionAvatarSignedUrl,
  removeImage: removeCollectionAvatar,
  reportRepairableFailure(kind, error) {
    console.error(`[atlas/collections/avatar] ${kind} failed`, error);
  },
});
