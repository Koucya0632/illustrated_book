import assert from "node:assert/strict";
import test from "node:test";
import { calendarMonth, monthRange } from "../lib/study-calendar";
import { localDay } from "../lib/timezone";

test("localDay buckets by the requested zone, not UTC", () => {
  assert.equal(localDay(new Date("2026-10-05T15:59:00Z"), "Asia/Taipei"), "2026-10-05");
  assert.equal(localDay(new Date("2026-10-05T16:01:00Z"), "Asia/Taipei"), "2026-10-06");
});

test("calendarMonth defaults to today's month and refuses future or malformed months", () => {
  assert.equal(calendarMonth(null, "2026-10-06"), "2026-10");
  assert.equal(calendarMonth("", "2026-10-06"), "2026-10");
  assert.equal(calendarMonth("2026-09", "2026-10-06"), "2026-09");
  assert.equal(calendarMonth("2026-10", "2026-10-06"), "2026-10");
  assert.equal(calendarMonth("2026-11", "2026-10-06"), null);
  assert.equal(calendarMonth("2026-13", "2026-10-06"), null);
  assert.equal(calendarMonth("2026-1", "2026-10-06"), null);
  assert.equal(calendarMonth("1999-12", "2026-10-06"), null);
});

test("monthRange crosses the year boundary", () => {
  assert.deepEqual(monthRange("2026-10"), { start: "2026-10-01", next: "2026-11-01" });
  assert.deepEqual(monthRange("2026-12"), { start: "2026-12-01", next: "2027-01-01" });
});
