import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_TIMEZONE, normalizeTimezone, readTimezone, startOfDay, zonedPeriod } from "../lib/timezone";

test("only a real IANA zone is accepted; everything else is Taipei", () => {
  assert.equal(normalizeTimezone("Asia/Tokyo"), "Asia/Tokyo");
  assert.equal(normalizeTimezone("America/Argentina/Buenos_Aires"), "America/Argentina/Buenos_Aires");
  for (const bad of [null, "", "Mars/Olympus", "'; DROP TABLE x", "Asia/Tokyo ", "a".repeat(80)]) {
    assert.equal(normalizeTimezone(bad), DEFAULT_TIMEZONE);
  }
});

test("the header is read case-insensitively and an absent one falls back", () => {
  const req = (h?: string) => new Request("https://t.test/", { headers: h ? { "X-Tuji-Timezone": h } : {} });
  assert.equal(readTimezone(req("Europe/London")), "Europe/London");
  assert.equal(readTimezone(req()), DEFAULT_TIMEZONE);
});

test("Taipei periods match the fixed +08:00 the check-in shipped with", () => {
  const p = zonedPeriod(new Date("2026-10-05T16:01:00Z"), "Asia/Taipei");
  assert.equal(p.day, "2026-10-06");
  assert.equal(p.dayStart.toISOString(), "2026-10-05T16:00:00.000Z");
  assert.equal(p.nextDay.toISOString(), "2026-10-06T16:00:00.000Z");
});

test("a zone behind UTC is still on yesterday", () => {
  const p = zonedPeriod(new Date("2026-10-06T03:00:00Z"), "America/Los_Angeles");
  assert.equal(p.day, "2026-10-05");
  assert.equal(p.dayStart.toISOString(), "2026-10-05T07:00:00.000Z");
});

test("DST days are 23 and 25 hours long", () => {
  // US spring forward 2027-03-14, fall back 2026-11-01.
  const spring = zonedPeriod(new Date("2027-03-14T18:00:00Z"), "America/New_York");
  assert.equal(spring.nextDay.getTime() - spring.dayStart.getTime(), 23 * 3_600_000);
  const fall = zonedPeriod(new Date("2026-11-01T18:00:00Z"), "America/New_York");
  assert.equal(fall.nextDay.getTime() - fall.dayStart.getTime(), 25 * 3_600_000);
  assert.equal(startOfDay("2026-11-01", "America/New_York").toISOString(), "2026-11-01T04:00:00.000Z");
});
