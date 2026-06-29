import { GoogleVisionAtlasProvider } from "./providers/google-vision";
import { ManualOnlyAtlasProvider } from "./providers/manual-only";
import { OpenAIDirectAtlasProvider } from "./providers/openai-direct";
import type { AtlasVisionProvider } from "./vision-provider";

export type AtlasProviderName = "google-vision" | "openai-direct" | "manual-only";

function normalizeProviderName(raw: string | undefined, fallback: AtlasProviderName): AtlasProviderName {
  if (raw === "google-vision" || raw === "openai-direct" || raw === "manual-only") return raw;
  return fallback;
}

export function createAtlasVisionProvider(name: AtlasProviderName): AtlasVisionProvider {
  if (name === "google-vision") return new GoogleVisionAtlasProvider();
  if (name === "openai-direct") return new OpenAIDirectAtlasProvider();
  return new ManualOnlyAtlasProvider();
}

export function createPrimaryAtlasProvider(): AtlasVisionProvider {
  return createAtlasVisionProvider(
    normalizeProviderName(process.env.ATLAS_PRIMARY_PROVIDER, "manual-only"),
  );
}

export function createFineAtlasProvider(): AtlasVisionProvider {
  return createAtlasVisionProvider(
    normalizeProviderName(process.env.ATLAS_FINE_PROVIDER, "manual-only"),
  );
}

export function createEscalateAtlasProvider(): AtlasVisionProvider {
  return createAtlasVisionProvider(
    normalizeProviderName(process.env.ATLAS_ESCALATE_PROVIDER, "manual-only"),
  );
}
