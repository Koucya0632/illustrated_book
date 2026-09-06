/**
 * The one place that knows what a *public* storage object URL looks like.
 *
 * Before this module the shape `{supabaseUrl}/storage/v1/object/public/{bucket}/{path}`
 * was spelled out in four separate files (two of them in this repo's own
 * `lib/atlas/storage.ts`), plus a fifth site that *validated* against it by
 * substring match. Moving the assets to another host meant finding all five.
 * Now the host is decided here and nowhere else.
 *
 * `parsePublicObjectUrl` accepts BOTH the Supabase shape and the asset-host
 * shape at the same time. That overlap is not cosmetic: the iOS app has these
 * absolute URLs in its own cache, so during a migration both spellings are
 * live and every validator has to keep saying yes to the old one.
 *
 * Client-importable on purpose (`lib/avatars.ts` runs in the browser), so it
 * reads only `NEXT_PUBLIC_*` env.
 */

export const PUBLIC_BUCKETS = [
  "word-images",
  "word-audio",
  "atlas-public-images",
  "user-avatars",
] as const;

export type PublicBucket = (typeof PUBLIC_BUCKETS)[number];

const SUPABASE_PUBLIC_PREFIX = "/storage/v1/object/public/";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/** Supabase project origin, e.g. `https://xxxx.supabase.co`. */
function supabaseBase(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return raw ? trimTrailingSlash(raw) : null;
}

/**
 * Optional CDN/object-store origin (e.g. an R2 custom domain). When set, new
 * URLs are minted against it; the Supabase spelling stays readable forever.
 */
function assetBase(): string | null {
  const raw = process.env.NEXT_PUBLIC_ASSET_BASE_URL;
  return raw ? trimTrailingSlash(raw) : null;
}

function isPublicBucket(value: string): value is PublicBucket {
  return (PUBLIC_BUCKETS as readonly string[]).includes(value);
}

/**
 * Build the canonical public URL for an object. Prefers the asset host when
 * one is configured, otherwise the Supabase public path.
 *
 * Path segments are encoded individually so a slash inside `path` stays a
 * path separator (`curtains/en-US.mp3`) rather than becoming `%2F`.
 */
export function publicObjectUrl(bucket: PublicBucket, path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const asset = assetBase();
  if (asset) return `${asset}/${bucket}/${encoded}`;
  const supabase = supabaseBase();
  if (!supabase) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  return `${supabase}${SUPABASE_PUBLIC_PREFIX}${bucket}/${encoded}`;
}

/**
 * Recognise one of our public object URLs, in either spelling, and pull the
 * bucket and path back out. Returns null for anything else — an arbitrary
 * https URL must not pass, which is what `lib/avatars.ts` leans on.
 */
export function parsePublicObjectUrl(
  value: unknown,
): { bucket: PublicBucket; path: string } | null {
  if (typeof value !== "string") return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const origin = trimTrailingSlash(url.origin);
  const decode = (segments: string[]) => segments.map(decodeURIComponent).join("/");

  const asset = assetBase();
  if (asset && origin === asset) {
    const [bucket, ...rest] = url.pathname.replace(/^\/+/, "").split("/");
    if (!bucket || rest.length === 0 || !isPublicBucket(bucket)) return null;
    return { bucket, path: decode(rest) };
  }

  const supabase = supabaseBase();
  if (supabase && origin === supabase && url.pathname.startsWith(SUPABASE_PUBLIC_PREFIX)) {
    const [bucket, ...rest] = url.pathname.slice(SUPABASE_PUBLIC_PREFIX.length).split("/");
    if (!bucket || rest.length === 0 || !isPublicBucket(bucket)) return null;
    return { bucket, path: decode(rest) };
  }

  return null;
}

/** True when `value` is one of our public object URLs (optionally: in `bucket`). */
export function isPublicObjectUrl(value: unknown, bucket?: PublicBucket): boolean {
  const parsed = parsePublicObjectUrl(value);
  return parsed !== null && (bucket === undefined || parsed.bucket === bucket);
}
