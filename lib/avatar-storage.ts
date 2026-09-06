import "server-only";
import { randomUUID } from "crypto";
import { AVATAR_BUCKET } from "@/lib/avatars";
import {
  ensurePublicBucket,
  listPublicObjects,
  putPublicObject,
  removePublicObjects,
} from "@/lib/storage/public-writer";

const MAX_PIXELS = 24_000_000;

async function ensureAvatarBucket(): Promise<void> {
  await ensurePublicBucket(AVATAR_BUCKET, {
    fileSizeLimit: "8MB",
    allowedMimeTypes: ["image/webp"],
  });
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
  const path = `${userId}/${randomUUID()}.webp`;
  return putPublicObject(AVATAR_BUCKET, path, body, { contentType: "image/webp" });
}

/** Keep storage bounded to the currently selected custom avatar. */
export async function pruneAvatarImages(userId: string, keepUrl?: string): Promise<void> {
  const keepName = keepUrl ? decodeURIComponent(new URL(keepUrl).pathname).split("/").pop() : undefined;
  const stale = (await listPublicObjects(AVATAR_BUCKET, userId)).filter(
    (path) => path.split("/").pop() !== keepName,
  );
  if (stale.length > 0) await removePublicObjects(AVATAR_BUCKET, stale);
}
