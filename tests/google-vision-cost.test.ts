// The google-vision provider serves every ordinary (primary) recognition, and
// until 2026-09 it never filled estimatedCostUsd — the admin cost column read $0
// for ~96 calls a month. These pin the estimate so the column stays honest.

import assert from "node:assert/strict";
import test from "node:test";
import { estimateGoogleVisionCostUsd } from "../lib/atlas/providers/google-vision";

test("one image with no translation costs the two Vision features at list price", () => {
  // LABEL_DETECTION $1.50 + OBJECT_LOCALIZATION $2.25 per 1,000 images.
  assert.equal(estimateGoogleVisionCostUsd({ translatedChars: 0 }), 0.00375);
});

test("translation adds $20 per million input characters", () => {
  // 50 chars sent to zh-TW and again to ja = 100 billed characters.
  assert.equal(estimateGoogleVisionCostUsd({ translatedChars: 100 }), 0.00575);
});

