import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

function read(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

function walk(dir) {
  const absolute = join(ROOT, dir);
  const out = [];
  for (const entry of readdirSync(absolute)) {
    const path = join(absolute, entry);
    const rel = relative(ROOT, path);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function tableDefinition(sql, table) {
  const marker = `CREATE TABLE IF NOT EXISTS ${table} (`;
  const start = sql.indexOf(marker);
  if (start < 0) return null;
  const after = sql.slice(start + marker.length);
  const end = after.indexOf(")`,");
  if (end < 0) return null;
  return after.slice(0, end);
}

const migrate = read("scripts/migrate.ts");
const docs = read("../docs/CUSTOM_ATLAS_TECH_PLAN.md");

const ownerTables = [
  "user_atlas_images",
  "user_atlas_recognition_jobs",
  "user_atlas_candidates",
  "user_atlas_items",
  "user_atlas_cards",
  "user_atlas_card_state",
  "user_atlas_item_mastery",
  "user_atlas_study_logs",
  "user_atlas_ai_usage",
];

for (const table of ownerTables) {
  const ddl = tableDefinition(migrate, table);
  check(Boolean(ddl), `${table}: missing CREATE TABLE`);
  check(Boolean(ddl?.match(/\buser_id\s+UUID\s+NOT NULL\b/i)), `${table}: user_id UUID NOT NULL missing`);
  check(
    migrate.includes(`ALTER TABLE ${table}`) &&
      migrate.includes("ENABLE ROW LEVEL SECURITY"),
    `${table}: RLS enable statement missing`,
  );
  check(
    migrate.includes(`"${table}"`) &&
      migrate.includes("CREATE POLICY ${t}_own ON ${t} FOR ALL") &&
      migrate.includes("USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)"),
    `${table}: owner-only auth.uid() = user_id policy missing`,
  );
}

check(
  !migrate.includes("CREATE TABLE IF NOT EXISTS user_atlas_item_grants"),
  "sharing grants must not be named user_atlas_item_grants",
);
check(
  migrate.includes("CREATE TABLE IF NOT EXISTS atlas_item_grants"),
  "atlas_item_grants sharing table missing",
);
check(
  docs.includes("atlas_item_grants") && !docs.includes("user_atlas_item_grants"),
  "plan docs must describe atlas_item_grants, not user_atlas_item_grants",
);

check(
  migrate.includes("CREATE TABLE IF NOT EXISTS atlas_public_items") &&
    migrate.includes("CREATE POLICY atlas_public_items_public_read"),
  "public atlas snapshot table or public read policy missing",
);

const apiFiles = walk("app/api")
  .filter((file) => file.endsWith("/route.ts"))
  .filter((file) => file.includes("app/api/atlas/") || file.includes("app/api/admin/atlas/"));

for (const file of apiFiles) {
  const source = read(file);
  const isPublicAtlas = file.includes("app/api/atlas/public/");
  if (isPublicAtlas) {
    check(
      source.includes("public, s-maxage=3600, stale-while-revalidate=86400"),
      `${file}: public atlas route must set public CDN cache headers`,
    );
  } else {
    check(
      source.includes("private, no-store") || source.includes("PATCH("),
      `${file}: private/admin atlas route should set Cache-Control: private, no-store`,
    );
  }
  check(
    !source.match(/\braw_response\b/) && !source.match(/\brawResponse\b/),
    `${file}: route must not expose raw provider response`,
  );
  check(
    !source.match(/\boriginal_path\s*:/) &&
      !source.match(/\bthumb_path\s*:/) &&
      !source.match(/\brecognition_path\s*:/),
    `${file}: route must not serialize private storage paths`,
  );
}

if (failures.length > 0) {
  console.error("[verify-atlas-privacy] failed");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`[verify-atlas-privacy] ok (${ownerTables.length} owner tables, ${apiFiles.length} routes checked)`);
