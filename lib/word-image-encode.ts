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

// Three tables hold `word-images` URLs, not one. Anything that prunes this
// bucket must build its keep-set from all of them:
//
//   words.image_url        480 rows — the primary image
//   categories.image_url    10 rows — category covers (`category-<id>.webp`)
//   word_media.url         480 rows — a mirror of the above from the schema-v3
//                                     backfill; nothing reads the `image` kind
//
// A 2026-08 cleanup keyed only on `words.image_url` and deleted the two objects
// the `categories` rows pointed at, 404-ing those covers in the shipped app.

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
///
/// Applied by `syncStorageBucketRules` in scripts/migrate.ts, i.e. once per
/// deploy. It used to be applied only by scripts/upload-images.ts — a manual
/// seeding script — so the promise above went unkept for as long as nobody ran
/// it: the live bucket accepted jpeg/png/gif up to 10 MB, and two 1 MB PNGs got
/// in that way. Declaring a rule and applying it are different things.
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
