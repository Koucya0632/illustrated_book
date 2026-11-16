// Pins bounded whole-number query params (`?limit=`, `?new=`, `?days=`).
// `?limit=abc` used to reach SQL `LIMIT` as NaN and 500 the request.

import assert from "node:assert/strict";
import test from "node:test";
import { parseIntParam } from "../lib/http/int-param";

test("missing or empty value uses the fallback", () => {
  assert.equal(parseIntParam(null, 60), 60);
  assert.equal(parseIntParam("", 60), 60);
});

test("a value that isn't a whole number uses the fallback", () => {
  for (const junk of ["abc", "NaN", "Infinity", "2.5", "1e3", "0x10", " 10", "10abc"]) {
    assert.equal(parseIntParam(junk, 60), 60, junk);
  }
});

test("a whole number is clamped to 1..100 by default", () => {
  assert.equal(parseIntParam("30", 60), 30);
  assert.equal(parseIntParam("1", 60), 1);
  assert.equal(parseIntParam("100", 60), 100);
  assert.equal(parseIntParam("0", 60), 1);
  assert.equal(parseIntParam("-5", 60), 1);
  assert.equal(parseIntParam("500", 60), 100);
  assert.equal(parseIntParam("99999999999999999999999", 60), 100);
});

test("min and max set the range", () => {
  assert.equal(parseIntParam("0", 10, { min: 0 }), 0);
  assert.equal(parseIntParam("-1", 10, { min: 0 }), 0);
  assert.equal(parseIntParam("300", 30, { max: 365 }), 300);
  assert.equal(parseIntParam("999", 30, { max: 365 }), 365);
  assert.equal(parseIntParam("abc", 5, { max: 20 }), 5);
});
