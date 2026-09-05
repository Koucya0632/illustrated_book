/**
 * Move the public asset buckets off Supabase Storage.
 *
 * Runs read-only by default. `--dry-run` (the default) touches nothing: it
 * inventories the buckets, then *discovers* every database reference by
 * scanning every text column in the schema for the public-storage prefix
 * rather than trusting a hand-written list of columns. This repo's recurring
 * defect is a rule applied to three call sites out of four, and a migration
 * that rewrites the columns someone remembered is exactly that defect with a
 * longer blast radius.
 *
 *   npx tsx --env-file=.env.local scripts/migrate-assets-to-r2.ts
 *   npx tsx --env-file=.env.local scripts/migrate-assets-to-r2.ts --json
 *
 * Copy and rewrite are separate, explicitly-flagged phases (not implemented
 * here yet) so that inventory can be reviewed before anything moves.
 */
import postgres from "postgres";

const PUBLIC_BUCKETS = ["word-images", "word-audio", "atlas-public-images", "user-avatars"] as const;
const PRIVATE_BUCKETS = ["user-atlas-images"] as const;
const PUBLIC_PREFIX = "/storage/v1/object/public/";

const asJson = process.argv.includes("--json");

function log(...args: unknown[]) {
  if (!asJson) console.log(...args);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { ssl: "require", max: 1 });

  try {
    // 1. What is actually in the buckets.
    const buckets = await sql<
      { name: string; objects: string; bytes: string }[]
    >`SELECT b.name,
             count(o.id)::text AS objects,
             COALESCE(sum((o.metadata->>'size')::bigint), 0)::text AS bytes
        FROM storage.buckets b
        LEFT JOIN storage.objects o ON o.bucket_id = b.id
       GROUP BY b.name
       ORDER BY 3 DESC`;

    log("\n=== 儲存桶 ===");
    let movingObjects = 0;
    let movingBytes = 0;
    for (const b of buckets) {
      const moving = (PUBLIC_BUCKETS as readonly string[]).includes(b.name);
      if (moving) {
        movingObjects += Number(b.objects);
        movingBytes += Number(b.bytes);
      }
      const tag = moving ? "搬" : (PRIVATE_BUCKETS as readonly string[]).includes(b.name) ? "留(私有簽名)" : "留";
      log(`  ${tag.padEnd(14)} ${b.name.padEnd(22)} ${String(b.objects).padStart(5)} 個  ${(Number(b.bytes) / 1024 / 1024).toFixed(1)} MB`);
    }

    // 2. Discover every text column in the schema, then ask each one whether
    //    it holds a public-storage URL. No hardcoded column list.
    const columns = await sql<{ table_name: string; column_name: string }[]>`
      SELECT c.table_name, c.column_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
       WHERE c.table_schema = 'public'
         AND t.table_type = 'BASE TABLE'
         AND c.data_type IN ('text', 'character varying', 'character')
       ORDER BY 1, 2`;

    const hits: { table: string; column: string; rows: number; buckets: string[] }[] = [];
    for (const { table_name, column_name } of columns) {
      const rows = await sql.unsafe<{ n: string; bucket: string }[]>(
        `SELECT split_part(substring("${column_name}" FROM $1), '/', 1) AS bucket, count(*)::text AS n
           FROM "${table_name}"
          WHERE "${column_name}" LIKE $2
          GROUP BY 1`,
        [`${PUBLIC_PREFIX}(.*)$`, `%${PUBLIC_PREFIX}%`],
      );
      if (rows.length === 0) continue;
      hits.push({
        table: table_name,
        column: column_name,
        rows: rows.reduce((a, r) => a + Number(r.n), 0),
        buckets: rows.map((r) => r.bucket),
      });
    }

    log("\n=== 資料庫裡引用了公開 URL 的欄位（掃描全部 text 欄位找出來的）===");
    let totalRows = 0;
    for (const h of hits) {
      totalRows += h.rows;
      log(`  ${`${h.table}.${h.column}`.padEnd(44)} ${String(h.rows).padStart(5)} 列   [${h.buckets.join(", ")}]`);
    }
    if (hits.length === 0) log("  (無)");

    // 3. Cross-check: does every referenced object actually exist, and is
    //    anything in the bucket referenced by nothing?
    log("\n=== 交叉比對 ===");
    const referenced = new Set<string>();
    for (const h of hits) {
      const rows = await sql.unsafe<{ v: string }[]>(
        `SELECT "${h.column}" AS v FROM "${h.table}" WHERE "${h.column}" LIKE $1`,
        [`%${PUBLIC_PREFIX}%`],
      );
      for (const r of rows) {
        const i = r.v.indexOf(PUBLIC_PREFIX);
        if (i >= 0) referenced.add(decodeURIComponent(r.v.slice(i + PUBLIC_PREFIX.length)));
      }
    }
    const stored = await sql<{ key: string }[]>`
      SELECT b.name || '/' || o.name AS key
        FROM storage.objects o JOIN storage.buckets b ON b.id = o.bucket_id
       WHERE b.name = ANY(${sql.array(PUBLIC_BUCKETS as unknown as string[])})`;
    const storedKeys = new Set(stored.map((s) => s.key));

    const missing = [...referenced].filter((k) => !storedKeys.has(k));
    const orphans = [...storedKeys].filter((k) => !referenced.has(k));
    log(`  被引用的物件      ${String(referenced.size).padStart(5)}`);
    log(`  桶裡實際有的物件  ${String(storedKeys.size).padStart(5)}`);
    log(`  ❗ 引用了但不存在  ${String(missing.length).padStart(5)}${missing.length ? "  → 搬過去也還是壞的" : ""}`);
    log(`  ⚠️  沒人引用的物件  ${String(orphans.length).padStart(5)}${orphans.length ? "  → 可考慮不搬" : ""}`);
    for (const m of missing.slice(0, 10)) log(`      missing: ${m}`);
    for (const o of orphans.slice(0, 10)) log(`      orphan:  ${o}`);
    if (orphans.length > 10) log(`      … 另外 ${orphans.length - 10} 個`);

    log("\n=== 這次會搬的量 ===");
    log(`  ${movingObjects.toLocaleString()} 個物件、${(movingBytes / 1024 / 1024).toFixed(1)} MB`);
    log(`  要改寫 ${totalRows.toLocaleString()} 列資料，橫跨 ${hits.length} 個欄位`);
    log("\n  （dry-run：以上完全沒有寫入任何東西）\n");

    if (asJson) {
      console.log(JSON.stringify({ buckets, hits, movingObjects, movingBytes, missing, orphans }, null, 2));
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
