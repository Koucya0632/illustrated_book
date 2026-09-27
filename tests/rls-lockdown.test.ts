// Pins the RLS lockdown (2026-09-27). 23 public tables — the three entitlement
// tables, atlas_saves, ratelimit_hits, every study_logs partition … — had RLS
// off while anon/authenticated held full table privileges, so anyone with the
// app's public key could write to them over the Supabase REST API (e.g. grant
// themselves Pro). The server connects as the owning role and bypasses RLS, and
// no client reads tables directly, so RLS-on-with-no-policy costs nothing.
//
// The lockdown must run (a) early in migrate, so a later content guard failing
// the deploy can't leave the hole open, (b) at the end of migrate, after later
// steps create tables, and (c) in the daily partman cron, which creates new
// study_logs partitions between deploys.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { rlsLockdownStatement } from "../lib/rls-lockdown";

test("quotes the table name as an identifier", () => {
  assert.equal(
    rlsLockdownStatement("study_logs_p20270101"),
    'ALTER TABLE public."study_logs_p20270101" ENABLE ROW LEVEL SECURITY',
  );
  assert.equal(
    rlsLockdownStatement('we"ird'),
    'ALTER TABLE public."we""ird" ENABLE ROW LEVEL SECURITY',
  );
});

test("migrate locks down right after DDL and again at the end", () => {
  const migrate = readFileSync(new URL("../scripts/migrate.ts", import.meta.url), "utf8");
  const calls = migrate.split("await lockDownPublicTables(sql)").length - 1;
  assert.equal(calls, 2, "expected two lockDownPublicTables calls in migrate.ts");
  const afterDdl = migrate.indexOf("DDL applied");
  const first = migrate.indexOf("await lockDownPublicTables(sql)");
  const partitioning = migrate.indexOf("await setupStudyLogsPartitioning(sql)");
  const last = migrate.lastIndexOf("await lockDownPublicTables(sql)");
  assert.ok(afterDdl < first && first < partitioning, "first lockdown must precede the content guards");
  assert.ok(last > partitioning, "last lockdown must follow partition setup");
});

test("the partman cron locks down the partitions it creates", () => {
  const cron = readFileSync(new URL("../app/api/cron/partman/route.ts", import.meta.url), "utf8");
  assert.ok(cron.includes("lockDownPublicTables("));
  assert.ok(
    cron.indexOf("run_maintenance") < cron.indexOf("lockDownPublicTables("),
    "lockdown must run after partman creates partitions",
  );
});
