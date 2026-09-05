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
