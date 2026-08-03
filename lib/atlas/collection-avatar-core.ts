export type CollectionAvatarImage = {
  bytes: Uint8Array;
  mimeType: string;
  size: number;
};

export type CollectionAvatarRecord = {
  avatarPath: string | null;
  avatarColor: string | null;
};

export type CollectionAvatarDependencies = {
  readOwned(userId: string, collectionId: string): Promise<CollectionAvatarRecord | null>;
  processImage(bytes: Uint8Array): Promise<{ bytes: Uint8Array; color: string }>;
  moderateImage(bytes: Uint8Array): Promise<"accepted" | "rejected" | "unavailable">;
  uploadImage(userId: string, collectionId: string, bytes: Uint8Array): Promise<string>;
  persist(
    userId: string,
    collectionId: string,
    avatar: { path: string; color: string },
  ): Promise<boolean>;
  previewImage(path: string): Promise<string>;
  removeImage(path: string): Promise<void>;
  reportRepairableFailure(kind: "cleanup", error: unknown): void;
};

export class CollectionAvatarError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const COLLECTION_AVATAR_MAX_BYTES = 8 * 1024 * 1024;
const COLLECTION_AVATAR_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function createCollectionAvatarModule(dependencies: CollectionAvatarDependencies) {
  return {
    async replace(userId: string, collectionId: string, image: CollectionAvatarImage) {
      const current = await dependencies.readOwned(userId, collectionId);
      if (!current) {
        throw new CollectionAvatarError("not_found", "collection not found", 404);
      }
      if (
        !COLLECTION_AVATAR_MIME_TYPES.has(image.mimeType) ||
        image.size > COLLECTION_AVATAR_MAX_BYTES
      ) {
        throw new CollectionAvatarError(
          "invalid_image",
          "請選擇 8MB 以下的 JPG、PNG、WebP 或 HEIC 圖片",
        );
      }

      let processed: { bytes: Uint8Array; color: string };
      try {
        processed = await dependencies.processImage(image.bytes);
      } catch {
        throw new CollectionAvatarError(
          "invalid_image",
          "無法讀取這張圖片，請換一張再試",
        );
      }
      const moderation = await dependencies.moderateImage(processed.bytes);
      if (moderation === "unavailable") {
        throw new CollectionAvatarError(
          "moderation_unavailable",
          "暫時無法檢查圖片，請稍後再試",
          503,
        );
      }
      if (moderation === "rejected") {
        throw new CollectionAvatarError(
          "avatar_rejected",
          "這張圖片無法設為集合頭像，請換一張再試",
          422,
        );
      }

      const path = await dependencies.uploadImage(userId, collectionId, processed.bytes);
      let avatarPreviewUrl: string;
      try {
        avatarPreviewUrl = await dependencies.previewImage(path);
        const persisted = await dependencies.persist(userId, collectionId, {
          path,
          color: processed.color,
        });
        if (!persisted) {
          throw new CollectionAvatarError("not_found", "collection not found", 404);
        }
      } catch (error) {
        await dependencies.removeImage(path).catch((cleanupError) => {
          dependencies.reportRepairableFailure("cleanup", cleanupError);
        });
        throw error;
      }

      if (current.avatarPath && current.avatarPath !== path) {
        await dependencies.removeImage(current.avatarPath).catch((error) => {
          dependencies.reportRepairableFailure("cleanup", error);
        });
      }

      return {
        ok: true as const,
        avatarColor: processed.color,
        avatarImageUrl: avatarPreviewUrl,
        avatarPreviewUrl,
      };
    },
  };
}
