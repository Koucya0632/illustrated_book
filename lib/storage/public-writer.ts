/**
 * Writing a public object and naming it are one operation, not two.
 *
 * They were split across the codebase: each writer uploaded to Supabase and
 * then spelled out its own URL. Centralising the URL in
 * `lib/storage/public-objects.ts` fixed the spelling but made the split
 * dangerous — the minter follows NEXT_PUBLIC_ASSET_BASE_URL while the writers
 * still went to Supabase, so configuring the asset host would have minted R2
 * URLs for objects that only existed on Supabase. Every newly uploaded image
 * would 404, and only newly uploaded ones, which is the kind of bug that gets
 * blamed on the client.
 *
 * So this module decides both, from one switch, and refuses to run when the
 * configuration would make the two disagree.
 */
import {
  DeleteObjectsCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { publicObjectUrl, type PublicBucket } from "./public-objects";
import {
  deleteObject,
  listAllObjects,
  putObject as restPutObject,
  restConfig,
  type RestConfig,
} from "./r2-rest";

export const DEFAULT_CACHE_CONTROL = "31536000";

export interface PutPublicObjectOptions {
  contentType: string;
  /** Seconds, matching the Supabase Storage API's own units. */
  cacheControl?: string;
  upsert?: boolean;
}

export type WriteBackend = "supabase" | "r2";

/**
 * How R2 is reached. S3 is the intended transport; REST exists because the
 * per-account S3 endpoint is currently refusing TLS (a Cloudflare-side
 * certificate provisioning bug), and a public asset host that cannot accept
 * new uploads is not a usable cutover.
 *
 * Probed once per process: the answer cannot change mid-process, and probing
 * per request would add a round trip to every upload.
 */
type R2Transport = { via: "s3" } | { via: "rest"; config: RestConfig };
let cachedTransport: Promise<R2Transport> | null = null;

interface R2Config {
  bucket: string;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
}

function r2Config(): R2Config | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  return {
    bucket: R2_BUCKET,
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    endpoint: process.env.R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  };
}

/**
 * Where bytes go. Tied to the same switch the URL minter reads, so the two
 * cannot drift: if URLs point at the asset host, that is where objects are
 * written.
 */
export function writeBackend(): WriteBackend {
  return process.env.NEXT_PUBLIC_ASSET_BASE_URL ? "r2" : "supabase";
}

/**
 * Fail at the boundary rather than after a half-written upload. Called by every
 * write path so a misconfigured deploy breaks loudly and immediately instead of
 * producing objects nobody can fetch.
 */
export function assertWriterConfigured(): void {
  if (writeBackend() !== "r2") return;
  if (r2Config() === null && restConfig() === null) {
    throw new Error(
      "NEXT_PUBLIC_ASSET_BASE_URL is set (URLs point at the asset host) but no R2 transport is configured. " +
        "Set R2_ACCOUNT_ID + R2_BUCKET and either R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY (S3) " +
        "or CLOUDFLARE_API_TOKEN (REST). Objects would be written to Supabase while their URLs named R2.",
    );
  }
}

async function r2Transport(): Promise<R2Transport> {
  cachedTransport ??= (async (): Promise<R2Transport> => {
    const config = r2Config();
    if (config) {
      try {
        await r2Client(config).send(new HeadBucketCommand({ Bucket: config.bucket }));
        return { via: "s3" };
      } catch (e) {
        const rest = restConfig();
        if (!rest) throw e;
        console.warn(
          `[storage] S3 endpoint unusable, falling back to the Cloudflare REST API: ${
            e instanceof Error ? e.message.slice(0, 120) : String(e)
          }`,
        );
        return { via: "rest", config: rest };
      }
    }
    const rest = restConfig();
    if (rest) return { via: "rest", config: rest };
    throw new Error("no R2 transport configured");
  })();
  return cachedTransport;
}

let cachedClient: S3Client | null = null;
function r2Client(config: R2Config): S3Client {
  cachedClient ??= new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: process.env.R2_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return cachedClient;
}

/** Write one public object and return the URL that now serves it. */
export async function putPublicObject(
  bucket: PublicBucket,
  path: string,
  body: Buffer,
  options: PutPublicObjectOptions,
): Promise<string> {
  assertWriterConfigured();
  const cacheControl = options.cacheControl ?? DEFAULT_CACHE_CONTROL;

  if (writeBackend() === "r2") {
    // Key must equal the URL path, or the object is unreachable at the URL
    // this function returns. tests/asset-migration-core.test.ts pins that.
    const key = `${bucket}/${path}`;
    const transport = await r2Transport();
    if (transport.via === "s3") {
      const config = r2Config()!;
      await r2Client(config).send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: options.contentType,
          CacheControl: `public, max-age=${cacheControl}, immutable`,
        }),
      );
    } else {
      await restPutObject(transport.config, key, body, {
        contentType: options.contentType,
        cacheControl: `public, max-age=${cacheControl}, immutable`,
      });
    }
  } else {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.storage.from(bucket).upload(path, body, {
      contentType: options.contentType,
      cacheControl,
      upsert: options.upsert ?? false,
    });
    if (error) throw new Error(error.message);
  }

  return publicObjectUrl(bucket, path);
}

/** Delete public objects from whichever backend currently holds them. */
export async function removePublicObjects(
  bucket: PublicBucket,
  paths: string[],
): Promise<void> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return;
  assertWriterConfigured();

  if (writeBackend() === "r2") {
    const transport = await r2Transport();
    if (transport.via === "s3") {
      const config = r2Config()!;
      for (let i = 0; i < unique.length; i += 1000) {
        await r2Client(config).send(
          new DeleteObjectsCommand({
            Bucket: config.bucket,
            Delete: { Objects: unique.slice(i, i + 1000).map((p) => ({ Key: `${bucket}/${p}` })) },
          }),
        );
      }
      return;
    }
    // The REST API deletes one key per call; these lists are a handful of
    // stale avatars, not a bulk purge.
    for (const p of unique) await deleteObject(transport.config, `${bucket}/${p}`);
    return;
  }

  const supabase = createServiceRoleClient();
  for (let i = 0; i < unique.length; i += 100) {
    const { error } = await supabase.storage.from(bucket).remove(unique.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }
}

/**
 * Object paths under `prefix`, relative to the bucket. Used by callers that
 * prune what they no longer reference, so it has to follow the same backend
 * switch as the writes — pruning Supabase while writing R2 would delete the
 * wrong generation of files.
 */
export async function listPublicObjects(
  bucket: PublicBucket,
  prefix: string,
): Promise<string[]> {
  assertWriterConfigured();

  if (writeBackend() === "r2") {
    const withSlash = prefix === "" ? "" : prefix.endsWith("/") ? prefix : `${prefix}/`;
    const transport = await r2Transport();
    if (transport.via === "rest") {
      const remote = await listAllObjects(transport.config, `${bucket}/${withSlash}`);
      return [...remote.keys()].map((key) => key.slice(bucket.length + 1));
    }
    const config = r2Config()!;
    const found: string[] = [];
    let token: string | undefined;
    do {
      const page = await r2Client(config).send(
        new ListObjectsV2Command({
          Bucket: config.bucket,
          Prefix: `${bucket}/${withSlash}`,
          ContinuationToken: token,
        }),
      );
      for (const item of page.Contents ?? []) {
        if (item.Key) found.push(item.Key.slice(bucket.length + 1));
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return found;
  }

  // Supabase caps a listing per call, so page it; callers use this to decide
  // what already exists, and a short read makes them redo finished work.
  const supabase = createServiceRoleClient();
  const found: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: 100, offset });
    if (error) return found;
    if (!data || data.length === 0) break;
    for (const item of data) found.push(prefix ? `${prefix}/${item.name}` : item.name);
    if (data.length < 100) break;
  }
  return found;
}

/**
 * Supabase needs its buckets created; R2 has one bucket that already exists.
 * Callers keep saying "ensure" and this decides whether that means anything.
 */
export async function ensurePublicBucket(
  bucket: PublicBucket,
  options: { fileSizeLimit: string; allowedMimeTypes: string[] },
): Promise<void> {
  assertWriterConfigured();
  if (writeBackend() === "r2") return;

  const supabase = createServiceRoleClient();
  const { error: getError } = await supabase.storage.getBucket(bucket);
  if (!getError) return;
  const { error: createError } = await supabase.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: options.fileSizeLimit,
    allowedMimeTypes: options.allowedMimeTypes,
  });
  if (createError && !/already exists/i.test(createError.message)) {
    throw new Error(createError.message);
  }
}
