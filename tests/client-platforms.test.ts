// Which apps may write platform-tagged rows, and every place that decides it.
//
// Android 意見回饋 was rejected for a week after the fix "landed": the feedback
// table's CHECK had been widened, but the route in front of it kept its own
// `new Set(["web", "ios"])`, and study_reports had not been widened at all.
// Five copies of one list, each edited separately. These tests hold them to one.

import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CLIENT_PLATFORMS, PLATFORM_LABELS, isClientPlatform } from "../lib/client-platforms";

const root = new URL("..", import.meta.url).pathname;
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("the three apps are accepted and nothing else is", () => {
  for (const p of ["web", "ios", "android"]) assert.equal(isClientPlatform(p), true, p);
  for (const p of ["", "Android", "ipad", null, undefined, 1]) assert.equal(isClientPlatform(p), false, String(p));
});

test("every platform has an admin label", () => {
  assert.deepEqual(Object.keys(PLATFORM_LABELS).sort(), [...CLIENT_PLATFORMS].sort());
});

test("the write routes validate against the shared list", () => {
  for (const route of ["app/api/users/feedback/route.ts", "app/api/study/reports/route.ts"]) {
    assert.match(read(route), /isClientPlatform\(platform\)/, route);
  }
  assert.match(read("lib/analytics-event.ts"), /isClientPlatform\(platform\)/);
});

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

test("no file in app/ or lib/ keeps a platform list of its own", () => {
  // A literal list starting with web and ios is how every stale copy looked.
  const offenders = [...sourceFiles("app"), ...sourceFiles("lib")]
    .filter((path) => path !== join("lib", "client-platforms.ts"))
    .filter((path) => /\[\s*["']web["']\s*,\s*["']ios["']/.test(read(path)));
  assert.deepEqual(offenders, []);
});

test("each table's platform CHECK in the migrations ends at the shared list", () => {
  // The CREATE TABLE only runs on a fresh database, so what production has is
  // the last constraint a migration adds. Both have to match.
  const migrate = read("scripts/migrate.ts");
  const expected = [...CLIENT_PLATFORMS].sort();
  const values = (list: string) => list.split(",").map((v) => v.trim().replace(/'/g, "")).sort();

  for (const table of ["feedback", "study_reports", "events"]) {
    const added = [...migrate.matchAll(
      new RegExp(`ADD CONSTRAINT ${table}_platform_chk\\s+CHECK \\(platform IN \\(([^)]*)\\)\\)`, "g"),
    )];
    assert.ok(added.length > 0, `${table}: no platform constraint is ever added`);
    assert.deepEqual(values(added.at(-1)![1]), expected, `${table}: last added constraint`);
  }
  for (const table of ["feedback", "study_reports"]) {
    const created = migrate.match(
      new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?platform\\s+TEXT NOT NULL CHECK \\(platform IN \\(([^)]*)\\)\\)`),
    );
    assert.ok(created, `${table}: CREATE TABLE has no platform CHECK`);
    assert.deepEqual(values(created[1]), expected, `${table}: CREATE TABLE`);
  }
});
