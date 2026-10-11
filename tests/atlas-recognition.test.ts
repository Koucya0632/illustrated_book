// 識別 through its one interface, with fake adapters at the seam.
import test from "node:test";
import assert from "node:assert/strict";
import { recognizeAtlasImage, type RecognitionAdapters } from "../lib/atlas/recognition";
import { recognitionDelivery } from "../lib/ai-operations/contracts";
import type { AtlasRecognitionResult, AtlasVisionInput, AtlasVisionProvider } from "../lib/atlas/vision-provider";

const input: AtlasVisionInput = { imageBytes: Buffer.from("x"), mimeType: "image/webp", targetLanguage: "en" };

function result(provider: string, stage: "primary" | "escalated", zhHant: string | null): AtlasRecognitionResult {
  return {
    provider, model: "fixture", stage,
    primary: [{ label: "kettle", normalizedLabel: "kettle", zhHant, gloss: null, confidence: 0.9, taxonomyNodeId: null }],
    fine: [],
    attributes: { colors: [], scene: null, count: null },
    uncertainty: { reason: null, needsEscalation: false },
  };
}
function adapter(name: string, zhHant: string | null, escalates: boolean): AtlasVisionProvider {
  return {
    name,
    recognizePrimary: async () => result(name, "primary", zhHant),
    ...(escalates ? { recognizeEscalated: async () => result(name, "escalated", zhHant) } : {}),
  };
}

test("普通識別 asks the primary adapter, 高精度 the precision one", async () => {
  const adapters: RecognitionAdapters = { primary: adapter("cheap", "水壺", false), precision: adapter("sharp", "水壺", true) };
  const primary = await recognizeAtlasImage("atlas.recognize.primary", input, adapters);
  assert.deepEqual([primary.provider, primary.stage], ["cheap", "primary"]);
  const precision = await recognizeAtlasImage("atlas.recognize.precision", input, adapters);
  assert.deepEqual([precision.provider, precision.stage], ["sharp", "escalated"]);
});

test("an adapter with no 高精度 of its own answers with its ordinary pass", async () => {
  const adapters: RecognitionAdapters = { primary: adapter("cheap", "水壺", false), precision: adapter("plain", "水壺", false) };
  const precision = await recognizeAtlasImage("atlas.recognize.precision", input, adapters);
  assert.deepEqual([precision.provider, precision.stage], ["plain", "primary"]);
});

test("a candidate the adapter could not name in Chinese is still deliverable", async () => {
  // google-vision leaves zhHant null when its translation call fails. The
  // operation contract requires a name, so the whole paid run used to be
  // released and the user shown nothing.
  for (const missing of [null, "  "]) {
    const adapters: RecognitionAdapters = { primary: adapter("cheap", missing, false), precision: adapter("sharp", missing, true) };
    const delivered = await recognizeAtlasImage("atlas.recognize.primary", input, adapters);
    // The label stands in — which is what needsChineseName reads as "none yet".
    assert.equal(delivered.primary[0].zhHant, "kettle");
    assert.equal(recognitionDelivery.safeParse(delivered).success, true);
  }
});
