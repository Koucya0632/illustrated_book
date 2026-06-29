import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

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

export async function removeAtlasPublicObjects(paths: string[]): Promise<void> {
  await removeStorageObjects(ATLAS_PUBLIC_BUCKET, paths);
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

export async function downloadAtlasObject(path: string): Promise<Buffer> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage
    .from(ATLAS_PRIVATE_BUCKET)
    .download(path);
  if (error) throw new Error(error.message);
  return Buffer.from(await data.arrayBuffer());
}

export async function ensureAtlasPublicBucket(): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error: getError } = await supabase.storage.getBucket(ATLAS_PUBLIC_BUCKET);
  if (!getError) return;

  const { error: createError } = await supabase.storage.createBucket(ATLAS_PUBLIC_BUCKET, {
    public: true,
    fileSizeLimit: "4MB",
    allowedMimeTypes: ["image/webp"],
  });
  if (createError && !/already exists/i.test(createError.message)) {
    throw new Error(createError.message);
  }
}

export async function publishAtlasShareImage(input: {
  publicItemId: string;
  privateThumbPath: string;
}): Promise<{ path: string; publicUrl: string }> {
  await ensureAtlasPublicBucket();
  const supabase = createServiceRoleClient();
  const bytes = await downloadAtlasObject(input.privateThumbPath);
  const path = `${input.publicItemId}/thumb.webp`;
  const { error } = await supabase.storage.from(ATLAS_PUBLIC_BUCKET).upload(path, bytes, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return {
    path,
    publicUrl: `${supabaseUrl}/storage/v1/object/public/${ATLAS_PUBLIC_BUCKET}/${path}`,
  };
}

export function atlasPublicImageUrl(path: string | null): string | null {
  if (!path) return null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;
  return `${supabaseUrl}/storage/v1/object/public/${ATLAS_PUBLIC_BUCKET}/${path}`;
}
