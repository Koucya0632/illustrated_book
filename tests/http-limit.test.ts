// Pins `?limit=` parsing for the public 物見 list routes. `?limit=abc` used to
// reach SQL `LIMIT` as NaN and 500 the request.

import assert from "node:assert/strict";
import test from "node:test";
import { parseLimit } from "../lib/http/limit";

test("missing or empty limit uses the fallback", () => {
  assert.equal(parseLimit(null, 60), 60);
  assert.equal(parseLimit("", 60), 60);
});

test("a limit that isn't a whole number uses the fallback", () => {
  for (const junk of ["abc", "NaN", "Infinity", "2.5", "1e3", "0x10", " 10", "10abc"]) {
    assert.equal(parseLimit(junk, 60), 60, junk);
  }
});

test("a whole-number limit is clamped to 1..100", () => {
  assert.equal(parseLimit("30", 60), 30);
  assert.equal(parseLimit("1", 60), 1);
  assert.equal(parseLimit("100", 60), 100);
  assert.equal(parseLimit("0", 60), 1);
  assert.equal(parseLimit("-5", 60), 1);
  assert.equal(parseLimit("500", 60), 100);
  assert.equal(parseLimit("99999999999999999999999", 60), 100);
});
