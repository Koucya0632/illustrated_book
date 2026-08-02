import {
  projectAuthorIdentity,
  PUBLIC_BIO_MAX,
  type AuthorIdentity,
  type AuthorIdentitySource,
} from "@/lib/public-author";

export const PROFILE_NICKNAME_MAX = 20;
export const PROFILE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const PROFILE_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export interface ProfileImage {
  bytes: Uint8Array;
  mimeType: string;
  size: number;
}

export interface ProfileEditCommand {
  nickname: unknown;
  bio: unknown;
  /** `face` resets to the one default avatar; omitted leaves it unchanged. */
  avatar?: unknown;
  image?: ProfileImage;
}

export interface ProfileEditDependencies {
  moderateText(value: string): { category: string }[];
  processImage(bytes: Uint8Array): Promise<Uint8Array>;
  moderateImage(bytes: Uint8Array): Promise<"accepted" | "rejected" | "unavailable">;
  uploadImage(userId: string, bytes: Uint8Array): Promise<string>;
  persist(
    userId: string,
    fields: { nickname: string | null; bio: string | null; avatar?: string },
  ): Promise<void>;
  read(userId: string): Promise<AuthorIdentitySource | null>;
  mirror(userId: string, identity: AuthorIdentity): Promise<void>;
  cleanupImages(userId: string, keepUrl?: string): Promise<void>;
  reportRepairableFailure(kind: "mirror" | "cleanup", error: unknown): void;
}

export class ProfileEditError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "ProfileEditError";
  }
}

function moderatedText(
  field: "nickname" | "bio",
  value: unknown,
  max: number,
  dependencies: ProfileEditDependencies,
): string | null {
  if (typeof value !== "string") {
    throw new ProfileEditError(`invalid_${field}`, field === "nickname" ? "暱稱格式不正確。" : "簽名格式不正確。");
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new ProfileEditError(
      `${field}_too_long`,
      field === "nickname" ? `暱稱最多 ${max} 字。` : `簽名最多 ${max} 字。`,
    );
  }
  const hits = trimmed ? dependencies.moderateText(trimmed) : [];
  if (hits.length > 0) {
    const hasPii = hits.some((hit) => hit.category === "pii");
    const label = field === "nickname" ? "暱稱" : "簽名";
    throw new ProfileEditError(
      `${field}_rejected`,
      hasPii
        ? `${label}不能包含個人資訊（電話、email、地址等）。`
        : `${label}不能包含網址、連結或不適當內容。`,
      422,
    );
  }
  return trimmed || null;
}

/**
 * Deep Profile-edit module. Validation, moderation, image ordering, the
 * authoritative commit, identity projection, and repairable side effects all
 * sit behind one `edit` interface.
 */
export function createProfileEditModule(dependencies: ProfileEditDependencies) {
  return {
    async edit(userId: string, command: ProfileEditCommand): Promise<{ ok: true; author: AuthorIdentity }> {
      const nickname = moderatedText(
        "nickname",
        command.nickname,
        PROFILE_NICKNAME_MAX,
        dependencies,
      );
      const bio = moderatedText("bio", command.bio, PUBLIC_BIO_MAX, dependencies);

      if (command.avatar !== undefined && command.avatar !== "face") {
        throw new ProfileEditError("invalid_avatar", "頭像格式不正確。");
      }
      if (
        command.image &&
        (!PROFILE_IMAGE_MIME_TYPES.has(command.image.mimeType) ||
          command.image.size > PROFILE_IMAGE_MAX_BYTES)
      ) {
        throw new ProfileEditError(
          "invalid_image",
          "請選擇 8MB 以下的 JPG、PNG、WebP 或 HEIC 圖片。",
        );
      }

      let avatar: string | undefined = command.avatar === "face" ? "face" : undefined;
      if (command.image) {
        const processed = await dependencies.processImage(command.image.bytes);
        const verdict = await dependencies.moderateImage(processed);
        if (verdict === "unavailable") {
          throw new ProfileEditError("moderation_unavailable", "目前無法檢查照片，請稍後再試。", 503);
        }
        if (verdict === "rejected") {
          throw new ProfileEditError("avatar_rejected", "這張照片不適合設為公開頭像，請換一張。", 422);
        }
        // Upload completes before the authoritative row changes. A failed
        // upload therefore cannot expose a partially edited public profile.
        avatar = await dependencies.uploadImage(userId, processed);
      }

      await dependencies.persist(userId, { nickname, bio, avatar });
      const row = await dependencies.read(userId);
      if (!row) throw new Error("profile disappeared after update");
      const author = projectAuthorIdentity(row);

      const repairs = await Promise.allSettled([
        dependencies.mirror(userId, author),
        avatar !== undefined
          ? dependencies.cleanupImages(userId, avatar === "face" ? undefined : avatar)
          : Promise.resolve(),
      ]);
      if (repairs[0].status === "rejected") {
        dependencies.reportRepairableFailure("mirror", repairs[0].reason);
      }
      if (repairs[1].status === "rejected") {
        dependencies.reportRepairableFailure("cleanup", repairs[1].reason);
      }

      return { ok: true, author };
    },
  };
}
