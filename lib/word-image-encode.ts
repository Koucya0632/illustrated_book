// The one encode for anything going into the `word-images` bucket.
//
// Before 2026-08 there was no encode at all: `scripts/upload-images.ts` pushed
// whatever came down the wire straight into Storage. That left 496 PNGs
// averaging 1.5 MB — 741 MB of bucket, served at full resolution to a 48x48
// marquee on the public marketing page and to iOS grid tiles — and it is what
// exhausted the Supabase egress quota and got the project restricted.
//
// It lives here rather than in any one script because three of them upload to
// this bucket (`upload-images`, `reencode-word-images`, `replace-main-word-images`)
// and a rule copied into three places is a rule that will be missed in one of
// them. Same reason `lib/avatar-storage.ts` owns the avatar encode instead of
// each caller doing its own resize.

import sharp from "sharp";

/// Wide enough for the iOS detail hero (~430pt @3x) and the web word page.
/// Grid tiles and the marquee are far smaller and downsample from this.
export const WORD_IMAGE_MAX_WIDTH = 1200;

/// Measured across the whole 496-image corpus: 740MB of PNG becomes 23.5MB at
/// this quality, and the least-compressible image in the set (`tree`, a photo,
/// 9.1x) is indistinguishable from its source at 3x zoom.
export const WORD_IMAGE_QUALITY = 82;

export const WORD_IMAGE_CONTENT_TYPE = "image/webp";

/// Bucket-level enforcement, so a future uploader that forgets `encodeWordImage`
/// is rejected by Storage rather than quietly re-creating the problem.
/// 2 MB: a 1200px WebP of these illustrations lands well under 200 KB, so
/// anything near this ceiling means something skipped the encode.
export const WORD_IMAGE_BUCKET_RULES = {
  public: true,
  fileSizeLimit: 2 * 1024 * 1024,
  allowedMimeTypes: [WORD_IMAGE_CONTENT_TYPE],
};

/// Whatever the input format, the output is WebP. Rasterises SVG too, which
/// the bucket never accepted anyway.
export async function encodeWordImage(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: "none" })
    .resize({ width: WORD_IMAGE_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: WORD_IMAGE_QUALITY })
    .toBuffer();
}

/// `access-card.png` -> `access-card.webp`. Preserves any `-v3` / `-ai-<sha>`
/// style suffix already in the key.
export function webpObjectKey(key: string): string {
  return key.replace(/\.[a-z0-9]+$/i, "") + ".webp";
}
