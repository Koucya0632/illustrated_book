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
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { writeFileSync, readFileSync } from "node:fs";
import { listAllObjects, putObject, restConfig, type RestConfig } from "./r2-rest";
import {
  CACHE_CONTROL_IMMUTABLE,
  decideCopy,
  planRewrite,
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
const wantsRewrite = argv.includes("--rewrite");
const revertFrom = argv.find((a) => a.startsWith("--revert="))?.slice("--revert=".length);
const execute = argv.includes("--execute");
const allowMissingTargets = argv.includes("--allow-missing-targets");

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

/**
 * Which transport can actually reach R2.
 *
 * S3 is the right long-term answer, so it is tried first and only abandoned
 * when the endpoint itself is unusable — currently a Cloudflare-side TLS
 * provisioning bug that fails before any credential is presented. The reason
 * is printed rather than silently swallowed: a fallback that hides an
 * authentication problem would be worse than no fallback.
 */
async function chooseTransport(): Promise<
  | { via: "s3"; target: NonNullable<ReturnType<typeof r2>> }
  | { via: "rest"; config: RestConfig }
  | { via: "none" }
> {
  const target = r2();
  if (target) {
    try {
      await target.client.send(new HeadBucketCommand({ Bucket: target.bucket }));
      return { via: "s3", target };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.log(`\n⚠️  S3 端點不可用，改走 Cloudflare REST API。原因：${message.slice(0, 90)}`);
    }
  }
  const config = restConfig();
  if (config) {
    console.log(`   REST 傳輸就緒（token 來源：${config.tokenSource}）`);
    return { via: "rest", config };
  }
  return { via: "none" };
}

async function copy() {
  const sql = db();
  const objects = await listSourceObjects(sql).finally(() => sql.end());
  const transport = await chooseTransport();

  if (transport.via === "none") {
    console.log("\n⚠️  兩種傳輸都不可用，改用「目的地是空的」來估算計畫。");
    console.log("   S3 需要 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET；");
    console.log("   REST 需要 R2_ACCOUNT_ID + R2_BUCKET，加上 CLOUDFLARE_API_TOKEN 或已登入的 wrangler。");
  }
  if (transport.via === "none" && execute) {
    // Without this the run would report every object as "copied" while writing
    // nothing, and the rewrite phase would then point the catalogue at an empty
    // bucket. Planning with no transport is fine; executing is not.
    console.log("\n❌ 沒有可用的傳輸方式，無法執行搬遷。先設定憑證再跑。\n");
    process.exit(1);
  }
  if (!execute) console.log("\n🔍 dry-run：不會寫入任何東西（要真的搬請加 --execute）");

  // Narrowed once, so the write path cannot be reached without a transport —
  // the guard above is the only place that decision is made.
  const writer = transport.via === "none" ? null : transport;

  // REST has no HEAD (405), so existence comes from one listing rather than a
  // request per object — which also makes the resumability check cheap.
  const remote =
    writer?.via === "rest" ? await listAllObjects(writer.config) : null;
  if (remote) console.log(`   目的地現有 ${remote.size} 個物件`);

  const stats = { copied: 0, skipped: 0, failed: 0, bytes: 0 };
  const failures: string[] = [];

  await pooled(objects, CONCURRENCY, async (obj) => {
    const key = r2KeyFor(obj.bucket, obj.name);

    let head: TargetHead | null = null;
    if (writer?.via === "s3") {
      try {
        const r = await writer.target.client.send(
          new HeadObjectCommand({ Bucket: writer.target.bucket, Key: key }),
        );
        head = { size: Number(r.ContentLength ?? 0), etag: r.ETag ?? null };
      } catch {
        head = null; // 404 or no access — treat as absent; a real auth problem surfaces on PUT.
      }
    } else if (remote) {
      const hit = remote.get(key);
      head = hit ? { size: hit.size, etag: hit.etag } : null;
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
      // Supabase drops connections under a sustained pull; a first run lost
      // objects to bare "fetch failed" rather than to any HTTP status.
      let body: Buffer | null = null;
      let sourceError: unknown;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          const res = await fetch(supabaseObjectUrl(obj.bucket, obj.name));
          if (res.status === 429 || res.status >= 500) throw new Error(`source HTTP ${res.status}`);
          if (!res.ok) {
            // A 404 will not become a 200 by asking again.
            sourceError = new Error(`source HTTP ${res.status}`);
            break;
          }
          body = Buffer.from(await res.arrayBuffer());
          break;
        } catch (e) {
          sourceError = e;
          if (attempt < 4) await new Promise((r) => setTimeout(r, 400 * 2 ** (attempt - 1)));
        }
      }
      if (!body) throw sourceError instanceof Error ? sourceError : new Error(String(sourceError));
      if (obj.size > 0 && body.byteLength !== obj.size) {
        throw new Error(`source size ${body.byteLength} != catalogued ${obj.size}`);
      }
      const md5 = createHash("md5").update(body).digest("hex");

      if (!writer) throw new Error("no transport configured");
      const contentType = obj.contentType ?? "application/octet-stream";
      const etag =
        writer.via === "s3"
          ? (
              await writer.target.client.send(
                new PutObjectCommand({
                  Bucket: writer.target.bucket,
                  Key: key,
                  Body: body,
                  ContentType: contentType,
                  CacheControl: CACHE_CONTROL_IMMUTABLE,
                }),
              )
            ).ETag ?? null
          : await putObject(writer.config, key, body, {
              contentType,
              cacheControl: CACHE_CONTROL_IMMUTABLE,
            });

      const integrity = verifyIntegrity(md5, etag);
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


interface JournalEntry {
  table: string;
  column: string;
  from: string;
  to: string;
  /** R2 object key the new URL resolves to; kept so the pre-flight check
   *  and any later audit do not have to re-derive it from the URL. */
  key: string;
  rows: number;
}

/** Every distinct stored value that looks like one of our public URLs. */
async function collectStoredValues(sql: ReturnType<typeof db>) {
  const columns = await sql<{ table_name: string; column_name: string }[]>`
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
       AND c.data_type IN ('text', 'character varying', 'character')
     ORDER BY 1, 2`;

  const found: { table: string; column: string; value: string; rows: number }[] = [];
  for (const { table_name, column_name } of columns) {
    const rows = await sql.unsafe<{ v: string; n: string }[]>(
      `SELECT "${column_name}" AS v, count(*)::text AS n
         FROM "${table_name}" WHERE "${column_name}" LIKE $1 GROUP BY 1`,
      [`%${PUBLIC_PREFIX}%`],
    );
    for (const r of rows) {
      found.push({ table: table_name, column: column_name, value: r.v, rows: Number(r.n) });
    }
  }
  return found;
}


/**
 * Two source files hold the same URLs the database does.
 *
 * lib/image-urls.json is not a cache: scripts/migrate.ts's syncSeedWordImages
 * pushes its values *back* into words.image_url on every production deploy. A
 * database rewrite that leaves this file on the old host is therefore undone
 * by the next merge to main — silently, and looking like someone else's fault.
 */
function rewriteCodeFiles(supabaseBase: string, assetBase: string) {
  const results: { file: string; changed: number; skipped: number }[] = [];

  // lib/image-urls.json — regenerated by sync-image-urls.ts, so keep its exact
  // formatting (2-space JSON + trailing newline) or every future run diffs.
  const jsonPath = "lib/image-urls.json";
  const map = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, string>;
  let jsonChanged = 0;
  let jsonSkipped = 0;
  for (const [id, value] of Object.entries(map)) {
    const outcome = planRewrite(value, supabaseBase, assetBase);
    if (outcome.kind === "rewrite") {
      map[id] = outcome.to;
      jsonChanged++;
    } else {
      jsonSkipped++;
    }
  }
  if (execute && jsonChanged > 0) {
    writeFileSync(jsonPath, JSON.stringify(map, null, 2) + "\n");
  }
  results.push({ file: jsonPath, changed: jsonChanged, skipped: jsonSkipped });

  // lib/categories.ts — hand-written literals. Replace whole quoted URLs only.
  const tsPath = "lib/categories.ts";
  let source = readFileSync(tsPath, "utf8");
  let tsChanged = 0;
  source = source.replace(/"(https:\/\/[^"]+)"/g, (whole, url: string) => {
    const outcome = planRewrite(url, supabaseBase, assetBase);
    if (outcome.kind !== "rewrite") return whole;
    tsChanged++;
    return `"${outcome.to}"`;
  });
  if (execute && tsChanged > 0) writeFileSync(tsPath, source);
  results.push({ file: tsPath, changed: tsChanged, skipped: 0 });

  return results;
}

async function rewrite() {
  const assetBase = (process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? "").replace(/\/+$/, "");
  const supabaseBase = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  if (!assetBase) throw new Error("NEXT_PUBLIC_ASSET_BASE_URL is not set — nothing to rewrite to");
  if (!supabaseBase) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");

  if (!execute) console.log("\n🔍 dry-run：不會寫入任何東西（要真的改請加 --execute）");
  console.log(`  來源 ${supabaseBase}\n  目的 ${assetBase}`);

  const sql = db();
  try {
    const stored = await collectStoredValues(sql);

    const journal: JournalEntry[] = [];
    const left = { "not-ours": 0, "already-migrated": 0, embedded: 0 } as Record<string, number>;
    const embedded: string[] = [];
    for (const s of stored) {
      const outcome = planRewrite(s.value, supabaseBase, assetBase);
      if (outcome.kind === "leave") {
        left[outcome.reason] += s.rows;
        if (outcome.reason === "embedded") embedded.push(`${s.table}.${s.column}: ${s.value.slice(0, 90)}`);
        continue;
      }
      journal.push({
        table: s.table,
        column: s.column,
        from: outcome.from,
        to: outcome.to,
        key: outcome.key,
        rows: s.rows,
      });
    }

    // Rewriting a row to a key that is not in R2 turns a working image into a
    // 404. Check before writing, not after.
    const target = r2();
    const missingTargets: string[] = [];
    if (target) {
      const keys = [...new Set(journal.map((j) => j.key))];
      await pooled(keys, CONCURRENCY, async (key) => {
        try {
          await target.client.send(new HeadObjectCommand({ Bucket: target.bucket, Key: key }));
        } catch {
          missingTargets.push(key);
        }
      });
    }

    const totalRows = journal.reduce((a, j) => a + j.rows, 0);
    console.log(`\n=== ${execute ? "改寫結果" : "改寫計畫"} ===`);
    console.log(`  要改寫       ${String(totalRows).padStart(5)} 列（${journal.length} 個相異值）`);
    console.log(`  已經是新的   ${String(left["already-migrated"]).padStart(5)} 列`);
    console.log(`  不屬於我們   ${String(left["not-ours"]).padStart(5)} 列`);
    console.log(`  夾在長文字裡 ${String(left["embedded"]).padStart(5)} 列（一律不動，只回報）`);
    for (const e of embedded.slice(0, 10)) console.log(`      ${e}`);

    if (!target) {
      console.log("\n  ⚠️  沒有 R2 憑證，略過「目標物件是否存在」的檢查。");
    } else if (missingTargets.length > 0) {
      console.log(`\n  ❗ 有 ${missingTargets.length} 個目標物件不在 R2：改寫過去就是 404`);
      for (const m of missingTargets.slice(0, 10)) console.log(`      ${m}`);
      if (!allowMissingTargets) {
        console.log("\n  已中止。先把 --copy --execute 跑完，或加 --allow-missing-targets 明示接受。\n");
        process.exit(1);
      }
    } else {
      console.log("\n  ✓ 每一個目標物件都已存在於 R2");
    }

    console.log("\n=== 程式碼檔案（與 DB 保持同步，否則下次部署會把 DB 改回去）===");
    for (const r of rewriteCodeFiles(supabaseBase, assetBase)) {
      console.log(`  ${r.file.padEnd(24)} ${execute ? "已改" : "要改"} ${String(r.changed).padStart(4)} 處，維持原狀 ${r.skipped}`);
    }

    if (!execute) {
      console.log("\n  （dry-run：沒有任何東西被改）\n");
      return;
    }

    const journalPath = `asset-rewrite-journal-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(journalPath, JSON.stringify(journal, null, 2));
    console.log(`\n  還原日誌已寫到 ${journalPath}`);

    // One transaction: a half-rewritten catalogue is worse than an unmigrated one.
    await sql.begin(async (tx) => {
      for (const j of journal) {
        await tx.unsafe(`UPDATE "${j.table}" SET "${j.column}" = $1 WHERE "${j.column}" = $2`, [j.to, j.from]);
      }
    });
    console.log(`  ✓ ${totalRows} 列已在單一交易中改寫`);
    console.log(`\n  還原：npx tsx --env-file=.env.local scripts/migrate-assets-to-r2.ts --revert=${journalPath} --execute\n`);
  } finally {
    await sql.end();
  }
}

async function revert(journalPath: string) {
  const journal: JournalEntry[] = JSON.parse(readFileSync(journalPath, "utf8"));
  const totalRows = journal.reduce((a, j) => a + j.rows, 0);
  console.log(`\n=== ${execute ? "還原" : "還原計畫"} ===`);
  console.log(`  日誌 ${journalPath}`);
  console.log(`  ${execute ? "要還原" : "會還原"} ${totalRows} 列（${journal.length} 個相異值）`);
  if (!execute) {
    console.log("\n  （dry-run：加 --execute 才真的還原）\n");
    return;
  }
  const sql = db();
  try {
    await sql.begin(async (tx) => {
      for (const j of journal) {
        await tx.unsafe(`UPDATE "${j.table}" SET "${j.column}" = $1 WHERE "${j.column}" = $2`, [j.from, j.to]);
      }
    });
    console.log(`  ✓ ${totalRows} 列已還原\n`);
  } finally {
    await sql.end();
  }
}

const mode = revertFrom ? revert(revertFrom) : wantsRewrite ? rewrite() : wantsCopy ? copy() : inventory();
mode.catch((e) => {
  console.error(e);
  process.exit(1);
});
