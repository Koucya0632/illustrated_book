// 識別 — one photograph in, candidates the learner can pick from out.
//
// Everything a caller would otherwise have to know sits behind the two
// functions here: how small the model's copy of the photo is, which adapter
// answers which feature, what happens when an adapter has no 高精度 of its own,
// and what a candidate must carry before it may be shown. The credit worker
// used to state the first three itself, and the pre-credit routes stated them
// twice more (docs/adr/0016 in tuji-ios).
//
// The seam is real: three adapters satisfy AtlasVisionProvider, chosen by env.

import { GoogleVisionAtlasProvider } from "./providers/google-vision";
import { ManualOnlyAtlasProvider } from "./providers/manual-only";
import { OpenAIDirectAtlasProvider } from "./providers/openai-direct";
import type { AtlasRecognitionResult, AtlasVisionInput, AtlasVisionProvider } from "./vision-provider";

export type AtlasProviderName = "google-vision" | "openai-direct" | "manual-only";
export type RecognitionFeature = "atlas.recognize.primary" | "atlas.recognize.precision";

/** The two adapters a deployment runs: 普通識別 and 高精度. */
export interface RecognitionAdapters {
  primary: AtlasVisionProvider;
  precision: AtlasVisionProvider;
}

function adapterNamed(raw: string | undefined): AtlasVisionProvider {
  if (raw === "google-vision") return new GoogleVisionAtlasProvider();
  if (raw === "openai-direct") return new OpenAIDirectAtlasProvider();
  return new ManualOnlyAtlasProvider();
}

/** ATLAS_PRIMARY_PROVIDER / ATLAS_ESCALATE_PROVIDER; unset means manual-only, which finds nothing. */
export function configuredRecognitionAdapters(): RecognitionAdapters {
  return {
    primary: adapterNamed(process.env.ATLAS_PRIMARY_PROVIDER),
    precision: adapterNamed(process.env.ATLAS_ESCALATE_PROVIDER),
  };
}

/**
 * The copy of a photo a model is shown. 1024px is deliberate: patch-billed
 * models charge by resolution, and the stored 1600px original hits the patch
 * cap at roughly double the input cost.
 */
export async function recognitionImage(original: Buffer): Promise<{ imageBytes: Buffer; mimeType: string }> {
  const sharp = (await import("sharp")).default;
  const imageBytes = await sharp(original, { limitInputPixels: 24_000_000 })
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  return { imageBytes, mimeType: "image/webp" };
}

/**
 * Run one 識別. An adapter with no 高精度 of its own answers with its ordinary
 * pass rather than nothing.
 *
 * Every candidate comes back with a Chinese name. google-vision leaves it null
 * when its translation call fails, and a null used to travel on until the
 * operation contract rejected the whole run — the user was shown nothing for a
 * photo that had been recognised. The label stands in, which is what
 * `needsChineseName` reads as "no Chinese name yet", so 補充 writes the real one.
 */
export async function recognizeAtlasImage(
  feature: RecognitionFeature,
  input: AtlasVisionInput,
  adapters: RecognitionAdapters = configuredRecognitionAdapters(),
): Promise<AtlasRecognitionResult> {
  const result = feature === "atlas.recognize.primary"
    ? await adapters.primary.recognizePrimary(input)
    : await (adapters.precision.recognizeEscalated?.(input) ?? adapters.precision.recognizePrimary(input));
  const named = <C extends { label: string; zhHant: string | null }>(c: C) =>
    ({ ...c, zhHant: c.zhHant?.trim() || c.label });
  return { ...result, primary: result.primary.map(named), fine: result.fine.map(named) };
}
