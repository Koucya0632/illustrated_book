import "server-only";
import { randomUUID } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { publicObjectUrl } from "@/lib/storage/public-objects";
import {
  ensurePublicBucket,
  putPublicObject,
  removePublicObjects,
} from "@/lib/storage/public-writer";

export const ATLAS_PRIVATE_BUCKET = "user-atlas-images";
export const ATLAS_PUBLIC_BUCKET = "atlas-public-images";
const SIGNED_URL_TTL_SECONDS = 10 * 60;

export interface AtlasImagePaths {
  originalPath: string;
  thumbPath: string;
  recognitionPath: string;
}

export interface AtlasImageBuffers {
  original: Buffer;
  thumb: Buffer;
}

export function atlasImagePaths(userId: string, imageId: string): AtlasImagePaths {
  return {
    originalPath: `${userId}/${imageId}/original.webp`,
    thumbPath: `${userId}/${imageId}/thumb.webp`,
    recognitionPath: `${userId}/${imageId}/recognition.webp`,
  };
}

export async function ensureAtlasPrivateBucket(): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error: getError } = await supabase.storage.getBucket(ATLAS_PRIVATE_BUCKET);
  if (!getError) return;

  const { error: createError } = await supabase.storage.createBucket(ATLAS_PRIVATE_BUCKET, {
    public: false,
    fileSizeLimit: "8MB",
    allowedMimeTypes: ["image/webp"],
  });
  if (createError && !/already exists/i.test(createError.message)) {
    throw new Error(createError.message);
  }
}

export async function uploadAtlasImageBuffers(
  paths: AtlasImagePaths,
  buffers: AtlasImageBuffers,
): Promise<void> {
  await ensureAtlasPrivateBucket();
  const supabase = createServiceRoleClient();
  const uploads = [
    { path: paths.originalPath, body: buffers.original },
    { path: paths.thumbPath, body: buffers.thumb },
  ];
  // Parallel — the two uploads are independent.
  await Promise.all(
    uploads.map(async (upload) => {
      const { error } = await supabase.storage
        .from(ATLAS_PRIVATE_BUCKET)
        .upload(upload.path, upload.body, {
          contentType: "image/webp",
          cacheControl: "3600",
          upsert: false,
        });
      if (error) throw new Error(error.message);
    }),
  );
}

async function removeStorageObjects(bucket: string, paths: string[]): Promise<void> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return;
  const supabase = createServiceRoleClient();
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const { error } = await supabase.storage.from(bucket).remove(chunk);
    if (error) throw new Error(error.message);
  }
}

export async function removeAtlasPrivateObjects(paths: string[]): Promise<void> {
  await removeStorageObjects(ATLAS_PRIVATE_BUCKET, paths);
}

export async function uploadCollectionAvatar(
  _userId: string,
  collectionId: string,
  body: Buffer,
): Promise<string> {
  await ensureAtlasPublicBucket();
  const path = `collections/${collectionId}/avatars/${randomUUID()}.webp`;
  await putPublicObject(ATLAS_PUBLIC_BUCKET, path, body, { contentType: "image/webp" });
  return path;
}

export async function createCollectionAvatarSignedUrl(path: string): Promise<string> {
  const publicUrl = collectionAvatarPublicUrl(path);
  if (publicUrl) return publicUrl;

  // Compatibility for avatars uploaded by the short-lived private-avatar
  // implementation. A new upload moves the collection onto the public path.
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage
    .from(ATLAS_PRIVATE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) throw new Error(error.message);
  if (!data?.signedUrl) throw new Error("failed to create collection avatar signed URL");
  return data.signedUrl;
}

export async function removeCollectionAvatar(path: string): Promise<void> {
  // The private bucket is signed-URL only and stays on Supabase; only the
  // public one follows the asset-host switch.
  if (isPublicCollectionAvatarPath(path)) {
    await removePublicObjects(ATLAS_PUBLIC_BUCKET, [path]);
    return;
  }
  await removeStorageObjects(ATLAS_PRIVATE_BUCKET, [path]);
}

export async function removeAtlasPublicObjects(paths: string[]): Promise<void> {
  await removePublicObjects(ATLAS_PUBLIC_BUCKET, paths);
}

export async function createAtlasImageSignedUrls(paths: {
  imagePath: string;
  thumbPath: string;
}): Promise<{ imageUrl: string; thumbUrl: string }> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage
    .from(ATLAS_PRIVATE_BUCKET)
    .createSignedUrls([paths.imagePath, paths.thumbPath], SIGNED_URL_TTL_SECONDS);
  if (error) throw new Error(error.message);

  const byPath = new Map((data ?? []).map((row) => [row.path, row.signedUrl]));
  const imageUrl = byPath.get(paths.imagePath);
  const thumbUrl = byPath.get(paths.thumbPath);
  if (!imageUrl || !thumbUrl) throw new Error("failed to create atlas signed URLs");
  return { imageUrl, thumbUrl };
}

/**
 * Batched variant of {@link createAtlasImageSignedUrls} for the study queue:
 * signs every card's image+thumb in a single `createSignedUrls` call instead
 * of one storage round-trip per card. Results are returned in input order.
 */
export async function createAtlasImageSignedUrlsBatch(
  paths: Array<{ imagePath: string; thumbPath: string }>,
): Promise<Array<{ imageUrl: string; thumbUrl: string }>> {
  if (paths.length === 0) return [];
  const supabase = createServiceRoleClient();
  // Dedupe (an item's image+thumb are distinct, but two rows could share an
  // image) before the one request; the by-path map fans the result back out.
  const unique = Array.from(new Set(paths.flatMap((p) => [p.imagePath, p.thumbPath])));
  const { data, error } = await supabase.storage
    .from(ATLAS_PRIVATE_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  if (error) throw new Error(error.message);

  const byPath = new Map((data ?? []).map((row) => [row.path, row.signedUrl]));
  return paths.map((p) => {
    const imageUrl = byPath.get(p.imagePath);
    const thumbUrl = byPath.get(p.thumbPath);
    if (!imageUrl || !thumbUrl) throw new Error("failed to create atlas signed URLs");
    return { imageUrl, thumbUrl };
  });
}

export async function downloadAtlasObject(path: string): Promise<Buffer> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage
    .from(ATLAS_PRIVATE_BUCKET)
    .download(path);
  if (error) throw new Error(error.message);
  return Buffer.from(await data.arrayBuffer());
}

export async function ensureAtlasPublicBucket(): Promise<void> {
  await ensurePublicBucket(ATLAS_PUBLIC_BUCKET, {
    fileSizeLimit: "4MB",
    allowedMimeTypes: ["image/webp"],
  });
}

export async function publishAtlasShareImage(input: {
  publicItemId: string;
  privateThumbPath: string;
}): Promise<{ path: string; publicUrl: string }> {
  await ensureAtlasPublicBucket();
  const bytes = await downloadAtlasObject(input.privateThumbPath);
  const path = `${input.publicItemId}/thumb.webp`;
  const publicUrl = await putPublicObject(ATLAS_PUBLIC_BUCKET, path, bytes, {
    contentType: "image/webp",
    upsert: true,
  });
  return { path, publicUrl };
}

export function atlasPublicImageUrl(path: string | null): string | null {
  return path ? publicObjectUrl(ATLAS_PUBLIC_BUCKET, path) : null;
}

export function isPublicCollectionAvatarPath(path: string): boolean {
  return path.startsWith("collections/") && path.includes("/avatars/");
}

export function collectionAvatarPublicUrl(path: string | null): string | null {
  return path && isPublicCollectionAvatarPath(path) ? atlasPublicImageUrl(path) : null;
}
