import assert from "node:assert/strict";
import test from "node:test";
import { accentToLang, normalizeSettings } from "../lib/settings";

test("Australian preference round-trips and maps to its own locale", () => {
  const settings = normalizeSettings({ accent: "au" });
  assert.equal(settings.accent, "au");
  assert.equal(accentToLang(settings.accent), "en-AU");
});

test("legacy and unknown accent values retain their existing defaults", () => {
  assert.equal(normalizeSettings({ accent: "us" }).accent, "us");
  assert.equal(normalizeSettings({ accent: "uk" }).accent, "uk");
  assert.equal(normalizeSettings({ accent: "invalid" as never }).accent, "us");
});
