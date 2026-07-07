import { GoogleVisionAtlasProvider } from "./providers/google-vision";
import { ManualOnlyAtlasProvider } from "./providers/manual-only";
import { OpenAIDirectAtlasProvider } from "./providers/openai-direct";
import type { AtlasTier } from "./entitlement";
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

/// Primary recognition is tier-split as an upgrade incentive: Free runs the
/// cheaper/weaker ATLAS_PRIMARY_PROVIDER_FREE (google-vision: generic labels,
/// machine-translated names), Pro runs ATLAS_PRIMARY_PROVIDER (openai-direct:
/// granularity ladder, brand reading, native zh/ja). Leaving the FREE var
/// unset collapses both tiers back to the same provider.
export function createPrimaryAtlasProvider(tier: AtlasTier): AtlasVisionProvider {
  const name =
    tier === "free"
      ? process.env.ATLAS_PRIMARY_PROVIDER_FREE || process.env.ATLAS_PRIMARY_PROVIDER
      : process.env.ATLAS_PRIMARY_PROVIDER;
  return createAtlasVisionProvider(normalizeProviderName(name, "manual-only"));
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
