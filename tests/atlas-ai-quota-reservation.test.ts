// Pins the monthly AI quota reservation (docs/MEMBERSHIP_ENGINEERING_CHECKLIST.md
// §4 「月額度以帳號為單位原子保留」). Static, like the other DB-bound tests.
//
// THE RED LINES:
//   - The check and the reservation happen under ONE per-user lock, so two
//     devices starting at once cannot both pass on the last unit.
//   - Every caller frees its reservation in a finally, or a finished call keeps
//     eating quota until the reservation expires.
//   - The readout and the check count with the same query.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const entitlement = read("lib/atlas/entitlement.ts");

test("check + insert run under a per-user advisory lock inside one transaction", () => {
  const fn = entitlement.slice(
    entitlement.indexOf("async function reserveAtlasAiQuota"),
    entitlement.indexOf("async function releaseAtlasAiReservation"),
  );
  const lock = fn.indexOf("pg_advisory_xact_lock");
  assert.ok(fn.includes("sql.begin(") && lock > 0);
  assert.ok(lock < fn.indexOf("monthlyAiUseCount(tx"), "lock before counting");
  assert.ok(fn.indexOf("monthlyAiUseCount(tx") < fn.indexOf("INSERT INTO atlas_ai_reservations"), "count before insert");
});

test("the readout and the reservation share one count", () => {
  assert.equal(entitlement.split("monthlyAiUseCount(").length - 1, 4, "definition + 2 readout + 1 reservation");
});

test("a backstop refusal frees the reservation it just took", () => {
  const fn = entitlement.slice(entitlement.indexOf("export async function enforceAtlasAiLimits"));
  const backstop = fn.slice(fn.indexOf("checkAtlasAiBackstops("), fn.indexOf("return { ok: true, tier, release"));
  assert.ok(backstop.includes("releaseAtlasAiReservation(reservationId)"));
});

for (const route of ["app/api/atlas/images/route.ts", "app/api/atlas/images/[id]/recognize/route.ts"]) {
  test(`${route} releases the reservation in a finally`, () => {
    assert.match(read(route), /finally \{[\s\S]{0,200}await aiLimit\.release\?\.\(\);/);
  });
}

test("the reservations table exists with a bounded operation set", () => {
  const migrate = read("scripts/migrate.ts");
  assert.match(migrate, /CREATE TABLE IF NOT EXISTS atlas_ai_reservations/);
  assert.match(migrate, /operation IN \('primary','escalated'\)/);
});
