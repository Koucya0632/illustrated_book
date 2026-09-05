/**
 * Pure decision logic for the Supabase → R2 asset copy. Kept free of I/O so
 * the parts that are easy to get quietly wrong — key mapping, "is this
 * already there?", integrity comparison — can be tested without credentials.
 */

export interface SourceObject {
  bucket: string;
  name: string;
  size: number;
  contentType: string | null;
}

/** What R2 already has at the target key, or null when absent. */
export interface TargetHead {
  size: number;
  /** S3 ETag. For a single-part upload this is the MD5 hex, quoted. */
  etag: string | null;
}

export type CopyAction =
  | { action: "copy"; reason: "missing" | "size-differs" }
  | { action: "skip"; reason: "already-present" };

/**
 * Object key in R2. The custom domain serves `https://host/<key>`, and
 * `publicObjectUrl(bucket, path)` mints `https://host/<bucket>/<path>`, so the
 * key has to be exactly `<bucket>/<path>` — with the raw, unencoded path,
 * because the edge URL-decodes before looking the key up.
 */
export function r2KeyFor(bucket: string, name: string): string {
  return `${bucket}/${name}`;
}

/**
 * Resumable by construction: a re-run copies only what is absent or differs,
 * so an interrupted migration is restarted rather than restarted-from-scratch.
 */
export function decideCopy(source: SourceObject, target: TargetHead | null): CopyAction {
  if (target === null) return { action: "copy", reason: "missing" };
  if (target.size !== source.size) return { action: "copy", reason: "size-differs" };
  return { action: "skip", reason: "already-present" };
}

/** Normalise an S3 ETag (quoted, sometimes with a `-partcount` suffix). */
export function normalizeEtag(etag: string | null | undefined): string | null {
  if (!etag) return null;
  const bare = etag.replace(/^"|"$/g, "");
  return bare.length > 0 ? bare.toLowerCase() : null;
}

/**
 * A single-part PUT round-trips its MD5 as the ETag, so a mismatch means the
 * bytes that landed are not the bytes we sent. Multipart ETags carry a
 * `-N` suffix and are not an MD5 — those we can only size-check.
 */
export function verifyIntegrity(
  localMd5: string,
  remoteEtag: string | null,
): { ok: boolean; reason: string } {
  const etag = normalizeEtag(remoteEtag);
  if (etag === null) return { ok: true, reason: "no etag returned; size checked only" };
  if (etag.includes("-")) return { ok: true, reason: "multipart etag; size checked only" };
  return etag === localMd5.toLowerCase()
    ? { ok: true, reason: "md5 matches" }
    : { ok: false, reason: `md5 mismatch: local ${localMd5}, remote ${etag}` };
}

export const CACHE_CONTROL_IMMUTABLE = "public, max-age=31536000, immutable";

/** Buckets whose objects are served by absolute public URL. */
export const PUBLIC_BUCKETS = [
  "word-images",
  "word-audio",
  "atlas-public-images",
  "user-avatars",
] as const;

export type PublicBucket = (typeof PUBLIC_BUCKETS)[number];

const SUPABASE_PUBLIC_PREFIX = "/storage/v1/object/public/";

/**
 * Recognise a stored value as a Supabase public URL, with the origin supplied
 * explicitly rather than read from the environment.
 *
 * That explicitness is the point: `lib/storage/public-objects.ts` resolves the
 * *current* host, and once the asset host is configured it stops recognising
 * anything as Supabase. A rewrite that used it would quietly match nothing and
 * report "0 rows to change" as if the job were already done.
 *
 * Whole-value only. A column that merely *contains* a URL inside longer text
 * is left alone and reported, because a blind substring replacement is how a
 * migration corrupts a field nobody remembered was free text.
 */
export function parseSupabasePublicUrl(
  value: string,
  supabaseBase: string,
): { bucket: PublicBucket; path: string } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.origin.replace(/\/+$/, "") !== supabaseBase.replace(/\/+$/, "")) return null;
  if (!url.pathname.startsWith(SUPABASE_PUBLIC_PREFIX)) return null;

  const [bucket, ...rest] = url.pathname.slice(SUPABASE_PUBLIC_PREFIX.length).split("/");
  if (!bucket || rest.length === 0) return null;
  if (!(PUBLIC_BUCKETS as readonly string[]).includes(bucket)) return null;

  return {
    bucket: bucket as PublicBucket,
    path: rest.map(decodeURIComponent).join("/"),
  };
}

export type RewriteOutcome =
  | { kind: "rewrite"; from: string; to: string; key: string }
  | { kind: "leave"; reason: "not-ours" | "already-migrated" | "embedded" };

/**
 * Decide what a single stored value becomes. Idempotent by construction: a
 * value already on the asset host no longer parses as Supabase, so a re-run
 * is a no-op rather than a double rewrite.
 */
export function planRewrite(
  value: string,
  supabaseBase: string,
  assetBase: string,
): RewriteOutcome {
  const trimmedAsset = assetBase.replace(/\/+$/, "");
  if (value.startsWith(`${trimmedAsset}/`)) return { kind: "leave", reason: "already-migrated" };

  const parsed = parseSupabasePublicUrl(value, supabaseBase);
  if (parsed === null) {
    return value.includes(SUPABASE_PUBLIC_PREFIX)
      ? { kind: "leave", reason: "embedded" }
      : { kind: "leave", reason: "not-ours" };
  }

  const encoded = parsed.path.split("/").map(encodeURIComponent).join("/");
  return {
    kind: "rewrite",
    from: value,
    to: `${trimmedAsset}/${parsed.bucket}/${encoded}`,
    key: r2KeyFor(parsed.bucket, parsed.path),
  };
}
