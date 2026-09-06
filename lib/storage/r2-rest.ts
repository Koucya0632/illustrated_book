/**
 * R2 over Cloudflare's REST API, as an alternative to the S3 endpoint.
 *
 * Why this exists: `https://<account>.r2.cloudflarestorage.com` currently
 * rejects the TLS handshake with alert 40 (unrecognized_name) — no certificate
 * is served for the per-account hostname. It is a Cloudflare-side provisioning
 * bug (many community reports through 2026), reproduced here from two
 * independent networks and identically for a real and a fabricated account id,
 * so it fails before any credential is ever presented.
 *
 * api.cloudflare.com serves a normal certificate and exposes the same object
 * operations, so the migration is not blocked on Cloudflare fixing theirs.
 *
 * Used by both the migration script and lib/storage/public-writer.ts. Runtime
 * writes need it for the same reason the migration did: the switch that points
 * URLs at R2 also points writes there, and a write path that cannot reach R2
 * would mint URLs for objects it failed to store.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const API = "https://api.cloudflare.com/client/v4";

export interface RestConfig {
  accountId: string;
  bucket: string;
  token: string;
  /** Where the token came from, so a 401 mid-run is self-explanatory. */
  tokenSource: "CLOUDFLARE_API_TOKEN" | "wrangler-oauth";
}

/**
 * A Wrangler OAuth token is accepted because it is what an already-logged-in
 * machine has, but it expires in about an hour — long enough for this
 * migration, not something to build on. CLOUDFLARE_API_TOKEN wins when set.
 */
function wranglerOAuthToken(): string | null {
  const path = join(homedir(), "Library/Preferences/.wrangler/config/default.toml");
  try {
    const match = readFileSync(path, "utf8").match(/oauth_token\s*=\s*"([^"]+)"/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function restConfig(): RestConfig | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !bucket) return null;

  const explicit = process.env.CLOUDFLARE_API_TOKEN;
  if (explicit) return { accountId, bucket, token: explicit, tokenSource: "CLOUDFLARE_API_TOKEN" };

  const oauth = wranglerOAuthToken();
  if (oauth) return { accountId, bucket, token: oauth, tokenSource: "wrangler-oauth" };

  return null;
}

function objectUrl(config: RestConfig, key: string): string {
  // Encode the whole key as one path segment: the API addresses objects by
  // key, not by a path, so slashes inside the key must not read as segments.
  return `${API}/accounts/${config.accountId}/r2/buckets/${config.bucket}/objects/${encodeURIComponent(key)}`;
}

export interface RemoteObject {
  size: number;
  etag: string;
}

/**
 * Every object in the bucket, keyed by object key.
 *
 * One listing instead of a request per object: the API has no HEAD (it answers
 * 405), and a GET to test existence would download the body it is checking.
 */
export async function listAllObjects(
  config: RestConfig,
  prefix?: string,
): Promise<Map<string, RemoteObject>> {
  const found = new Map<string, RemoteObject>();
  let cursor: string | undefined;

  for (;;) {
    const url = new URL(`${API}/accounts/${config.accountId}/r2/buckets/${config.bucket}/objects`);
    url.searchParams.set("per_page", "1000");
    if (prefix) url.searchParams.set("prefix", prefix);
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${config.token}` } });
    const body = (await res.json()) as {
      success: boolean;
      errors?: unknown;
      result?: Array<{ key: string; size: number | string; etag: string }>;
      result_info?: { cursor?: string; is_truncated?: boolean } | null;
    };
    if (!res.ok || !body.success) {
      throw new Error(`list objects failed (HTTP ${res.status}): ${JSON.stringify(body.errors).slice(0, 200)}`);
    }

    for (const item of body.result ?? []) {
      found.set(item.key, { size: Number(item.size), etag: item.etag });
    }

    const next = body.result_info?.cursor;
    if (!next || !body.result_info?.is_truncated) break;
    cursor = next;
  }

  return found;
}

/**
 * Cloudflare's API allows roughly 1,200 requests per five minutes per user —
 * about four a second. A first run at concurrency 8 drew HTTP 429 for 1,549 of
 * 4,870 objects, so requests are spaced rather than merely retried: backing off
 * after the fact still spends the budget on rejections.
 */
const MIN_REQUEST_SPACING_MS = 300;
let nextSlot = 0;

async function rateLimited<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_REQUEST_SPACING_MS;
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
  return fn();
}

/**
 * Retries what is worth retrying: 429 (honouring Retry-After), 5xx, and the
 * transport-level failures that show up as a rejected fetch. A 4xx that is not
 * 429 is a fact about the request, so it fails immediately rather than being
 * repeated five times.
 */
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const retryAfter = e instanceof RetryableError ? e.retryAfterMs : null;
      if (e instanceof Error && !(e instanceof RetryableError)) {
        // Not classified as retryable: a transport failure (fetch rejects with
        // a TypeError) still is, anything else is not.
        if (e.name !== "TypeError" && !/fetch failed/i.test(e.message)) throw e;
      }
      if (attempt === attempts) break;
      const backoff = retryAfter ?? Math.min(30_000, 500 * 2 ** (attempt - 1)) + Math.random() * 250;
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

class RetryableError extends Error {
  constructor(message: string, readonly retryAfterMs: number | null) {
    super(message);
    this.name = "RetryableError";
  }
}

/** Upload one object. Returns the ETag, which is the MD5 for a single PUT. */
export async function putObject(
  config: RestConfig,
  key: string,
  body: Buffer,
  headers: { contentType: string; cacheControl: string },
): Promise<string | null> {
  return withRetry(`put ${key}`, () =>
    rateLimited(async () => {
      const res = await fetch(objectUrl(config, key), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": headers.contentType,
          "Cache-Control": headers.cacheControl,
        },
        body: new Uint8Array(body),
      });

      if (res.status === 429 || res.status >= 500) {
        const header = res.headers.get("retry-after");
        const retryAfterMs = header ? Number(header) * 1000 : null;
        throw new RetryableError(`HTTP ${res.status}`, Number.isFinite(retryAfterMs) ? retryAfterMs : null);
      }

      const payload = (await res.json().catch(() => null)) as
        | { success?: boolean; errors?: unknown; result?: { etag?: string } }
        | null;

      if (!res.ok || !payload?.success) {
        const detail = payload?.errors ? JSON.stringify(payload.errors).slice(0, 200) : `HTTP ${res.status}`;
        throw new Error(`put failed: ${detail}`);
      }
      return payload.result?.etag ?? null;
    }),
  );
}

/** Delete one object. A key that is already gone is not an error. */
export async function deleteObject(config: RestConfig, key: string): Promise<void> {
  await withRetry(`delete ${key}`, () =>
    rateLimited(async () => {
      const res = await fetch(objectUrl(config, key), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${config.token}` },
      });
      if (res.status === 429 || res.status >= 500) {
        const header = res.headers.get("retry-after");
        const retryAfterMs = header ? Number(header) * 1000 : null;
        throw new RetryableError(`HTTP ${res.status}`, Number.isFinite(retryAfterMs) ? retryAfterMs : null);
      }
      if (!res.ok && res.status !== 404) throw new Error(`delete failed: HTTP ${res.status}`);
    }),
  );
}
