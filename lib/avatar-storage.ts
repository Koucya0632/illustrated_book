import "server-only";
import { randomUUID } from "crypto";
import { AVATAR_BUCKET } from "@/lib/avatars";
import { createServiceRoleClient } from "@/lib/supabase/server";

const MAX_PIXELS = 24_000_000;

async function ensureAvatarBucket(): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error: getError } = await supabase.storage.getBucket(AVATAR_BUCKET);
  if (!getError) return;

  const { error: createError } = await supabase.storage.createBucket(AVATAR_BUCKET, {
    public: true,
    fileSizeLimit: "8MB",
    allowedMimeTypes: ["image/webp"],
  });
  if (createError && !/already exists/i.test(createError.message)) {
    throw new Error(createError.message);
  }
}

export async function processAvatarImage(input: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(input, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width: 512, height: 512, fit: "cover", position: "attention" })
    .webp({ quality: 86 })
    .toBuffer();
}

export async function uploadAvatarImage(userId: string, body: Buffer): Promise<string> {
  await ensureAvatarBucket();
  const supabase = createServiceRoleClient();
  const path = `${userId}/${randomUUID()}.webp`;
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, body, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Keep storage bounded to the currently selected custom avatar. */
export async function pruneAvatarImages(userId: string, keepUrl?: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).list(userId, { limit: 100 });
  if (error) return;
  const keepName = keepUrl ? decodeURIComponent(new URL(keepUrl).pathname).split("/").pop() : undefined;
  const stale = (data ?? []).filter((item) => item.name !== keepName).map((item) => `${userId}/${item.name}`);
  if (stale.length > 0) await supabase.storage.from(AVATAR_BUCKET).remove(stale);
}
