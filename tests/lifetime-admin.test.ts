// Pins the operator side of 永久權益 (docs/MEMBERSHIP_SERVER_DESIGN.md §7,
// phase 4). Static, like the migrate tests: these paths only run against the
// production database.
//
// THE RED LINES:
//   - An operator can never revoke an App Store purchase — it ends only via
//     Apple's refund, exactly as revoking a Pro grant never cancels a
//     subscription (ADR-0004).
//   - The cutover script writes nothing unless told to (--apply), and the admin
//     member views read has_lifetime, or a lifetime member shows up as 免費.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("operator revoke skips App Store holdings", () => {
  const src = read("lib/atlas/lifetime.ts");
  const fn = src.slice(src.indexOf("export async function revokeLifetimeGrant"));
  assert.match(fn, /AND source <> 'appstore'/);
});

test("operator grant never creates a second live holding", () => {
  const src = read("lib/atlas/lifetime.ts");
  const fn = src.slice(
    src.indexOf("export async function grantLifetimeHolding"),
    src.indexOf("export async function revokeLifetimeGrant"),
  );
  assert.ok(fn.indexOf("already_held") < fn.indexOf("INSERT INTO user_lifetime_entitlements"));
});

test("the cutover script is a dry run unless --apply is passed", () => {
  const src = read("scripts/grant-legacy-pro-lifetime.ts");
  assert.match(src, /const apply = process\.argv\.includes\("--apply"\)/);
  const loop = src.slice(src.indexOf("for (const r of rows)"));
  assert.ok(loop.indexOf("if (!apply)") < loop.indexOf("grantLifetimeHolding("));
});

test("both admin member queries know about lifetime", () => {
  const src = read("lib/admin/members.ts");
  assert.equal(src.split("AS has_lifetime").length - 1, 2);
});
