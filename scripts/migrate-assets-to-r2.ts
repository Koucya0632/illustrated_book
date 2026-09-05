/**
 * Move the public asset buckets off Supabase Storage and onto R2.
 *
 *   # 1. read-only inventory (default)
 *   npx tsx --env-file=.env.local scripts/migrate-assets-to-r2.ts
 *
 *   # 2. plan the copy — still writes nothing
 *   npx tsx --env-file=.env.local scripts/migrate-assets-to-r2.ts --copy
 *
 *   # 3. actually copy
 *   npx tsx --env-file=.env.local scripts/migrate-assets-to-r2.ts --copy --execute
 *
 * The inventory discovers database references by scanning every text column in
 * the schema rather than trusting a hand-written column list. That is not
 * belt-and-braces: the hand-written list missed word_media and
 * word_example_media, which between them hold 4,830 of the 5,857 rows.
 *
 * Rewriting those rows is a separate phase, deliberately not in this file yet.
 */
import { createHash } from "node:crypto";
import postgres from "postgres";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  CACHE_CONTROL_IMMUTABLE,
  decideCopy,
  r2KeyFor,
  verifyIntegrity,
  type SourceObject,
  type TargetHead,
} from "./asset-migration-core";

const PUBLIC_BUCKETS = ["word-images", "word-audio", "atlas-public-images", "user-avatars"] as const;
const PRIVATE_BUCKETS = ["user-atlas-images"] as const;
const PUBLIC_PREFIX = "/storage/v1/object/public/";
const CONCURRENCY = 8;

const argv = process.argv.slice(2);
const wantsCopy = argv.includes("--copy");
const execute = argv.includes("--execute");

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, { ssl: "require", max: 1 });
}

/**
 * The source is always Supabase, so this deliberately does NOT go through
 * lib/storage/public-objects.ts: once NEXT_PUBLIC_ASSET_BASE_URL is set, that
 * module mints R2 URLs, and a copy job that reads from its own destination
 * would report success while moving nothing.
 */
function supabaseObjectUrl(bucket: string, name: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  const encoded = name.split("/").map(encodeURIComponent).join("/");
  return `${base.replace(/\/+$/, "")}${PUBLIC_PREFIX}${bucket}/${encoded}`;
}

function r2() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  return {
    bucket: R2_BUCKET,
    client: new S3Client({
      region: "auto",
      // R2_ENDPOINT covers jurisdiction-specific endpoints (…eu.r2.cloudflarestorage.com)
      // and lets the copy path be exercised against a local S3 stand-in.
      endpoint: process.env.R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      forcePathStyle: process.env.R2_FORCE_PATH_STYLE === "true",
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    }),
  };
}

async function pooled<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) await worker(items[cursor++]);
    }),
  );
}

async function listSourceObjects(sql: ReturnType<typeof db>): Promise<SourceObject[]> {
  const rows = await sql<{ bucket: string; name: string; size: string; mimetype: string | null }[]>`
    SELECT b.name AS bucket,
           o.name AS name,
           COALESCE((o.metadata->>'size')::bigint, 0)::text AS size,
           o.metadata->>'mimetype' AS mimetype
      FROM storage.objects o
      JOIN storage.buckets b ON b.id = o.bucket_id
     WHERE b.name = ANY(${[...PUBLIC_BUCKETS]}::text[])
     ORDER BY 1, 2`;
  return rows.map((r) => ({
    bucket: r.bucket,
    name: r.name,
    size: Number(r.size),
    contentType: r.mimetype,
  }));
}

async function inventory() {
  const sql = db();
  try {
    const buckets = await sql<{ name: string; objects: string; bytes: string }[]>`
      SELECT b.name, count(o.id)::text AS objects,
             COALESCE(sum((o.metadata->>'size')::bigint), 0)::text AS bytes
        FROM storage.buckets b LEFT JOIN storage.objects o ON o.bucket_id = b.id
       GROUP BY b.name ORDER BY 3 DESC`;

    console.log("\n=== 儲存桶 ===");
    for (const b of buckets) {
      const moving = (PUBLIC_BUCKETS as readonly string[]).includes(b.name);
      const tag = moving ? "搬" : (PRIVATE_BUCKETS as readonly string[]).includes(b.name) ? "留(私有簽名)" : "留";
      console.log(`  ${tag.padEnd(14)} ${b.name.padEnd(22)} ${String(b.objects).padStart(5)} 個  ${(Number(b.bytes) / 1048576).toFixed(1)} MB`);
    }

    const columns = await sql<{ table_name: string; column_name: string }[]>`
      SELECT c.table_name, c.column_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
       WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
         AND c.data_type IN ('text', 'character varying', 'character')
       ORDER BY 1, 2`;

    console.log("\n=== 引用了公開 URL 的欄位（掃描全部 text 欄位找出來的）===");
    let totalRows = 0;
    for (const { table_name, column_name } of columns) {
      const rows = await sql.unsafe<{ n: string }[]>(
        `SELECT count(*)::text AS n FROM "${table_name}" WHERE "${column_name}" LIKE $1`,
        [`%${PUBLIC_PREFIX}%`],
      );
      const n = Number(rows[0]?.n ?? 0);
      if (n === 0) continue;
      totalRows += n;
      console.log(`  ${`${table_name}.${column_name}`.padEnd(44)} ${String(n).padStart(5)} 列`);
    }
    console.log(`\n  合計 ${totalRows.toLocaleString()} 列待改寫（改寫是另一個階段，還沒實作）\n`);
  } finally {
    await sql.end();
  }
}

async function copy() {
  const sql = db();
  const target = r2();
  const objects = await listSourceObjects(sql).finally(() => sql.end());

  if (!target) {
    console.log("\n⚠️  R2 憑證未設定，改用「目的地是空的」來估算計畫。");
    console.log("   設定 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET 後可得真實差異。");
  }
  if (!execute) console.log("\n🔍 dry-run：不會寫入任何東西（要真的搬請加 --execute）");

  const stats = { copied: 0, skipped: 0, failed: 0, bytes: 0 };
  const failures: string[] = [];

  await pooled(objects, CONCURRENCY, async (obj) => {
    const key = r2KeyFor(obj.bucket, obj.name);

    let head: TargetHead | null = null;
    if (target) {
      try {
        const r = await target.client.send(
          new HeadObjectCommand({ Bucket: target.bucket, Key: key }),
        );
        head = { size: Number(r.ContentLength ?? 0), etag: r.ETag ?? null };
      } catch {
        head = null; // 404 or no access — treat as absent; a real auth problem surfaces on PUT.
      }
    }

    const decision = decideCopy(obj, head);
    if (decision.action === "skip") {
      stats.skipped++;
      return;
    }
    if (!execute) {
      stats.copied++;
      stats.bytes += obj.size;
      return;
    }

    try {
      const res = await fetch(supabaseObjectUrl(obj.bucket, obj.name));
      if (!res.ok) throw new Error(`source HTTP ${res.status}`);
      const body = Buffer.from(await res.arrayBuffer());
      if (obj.size > 0 && body.byteLength !== obj.size) {
        throw new Error(`source size ${body.byteLength} != catalogued ${obj.size}`);
      }
      const md5 = createHash("md5").update(body).digest("hex");

      const put = await target!.client.send(
        new PutObjectCommand({
          Bucket: target!.bucket,
          Key: key,
          Body: body,
          ContentType: obj.contentType ?? "application/octet-stream",
          CacheControl: CACHE_CONTROL_IMMUTABLE,
        }),
      );

      const integrity = verifyIntegrity(md5, put.ETag ?? null);
      if (!integrity.ok) throw new Error(integrity.reason);

      stats.copied++;
      stats.bytes += body.byteLength;
      if (stats.copied % 250 === 0) console.log(`  … 已搬 ${stats.copied}`);
    } catch (e) {
      stats.failed++;
      failures.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  console.log(`\n=== ${execute ? "搬遷結果" : "搬遷計畫"} ===`);
  console.log(`  ${execute ? "已搬" : "要搬"}   ${String(stats.copied).padStart(5)} 個  ${(stats.bytes / 1048576).toFixed(1)} MB`);
  console.log(`  已存在 ${String(stats.skipped).padStart(5)} 個`);
  console.log(`  失敗   ${String(stats.failed).padStart(5)} 個`);
  for (const f of failures.slice(0, 20)) console.log(`      ${f}`);
  if (failures.length > 20) console.log(`      … 另外 ${failures.length - 20} 個`);
  console.log("\n  重跑是安全的：已存在且大小相同的會直接跳過。\n");

  if (stats.failed > 0) process.exit(1);
}

(wantsCopy ? copy() : inventory()).catch((e) => {
  console.error(e);
  process.exit(1);
});
