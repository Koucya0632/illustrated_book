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

/// Primary recognition (普通識別) can be tier-split via ATLAS_PRIMARY_PROVIDER_FREE:
/// Free runs it while Pro runs ATLAS_PRIMARY_PROVIDER. Currently both are set to
/// google-vision (generic labels, machine-translated zh/ja names), so primary is
/// identical across tiers and Pro's upgrade incentive is the 高精度 escalate stage.
/// Point the FREE var at a weaker provider than ATLAS_PRIMARY_PROVIDER (e.g.
/// google-vision vs openai-direct's granularity ladder / brand reading) to
/// re-introduce a split; unset collapses both tiers back to the same provider.
export function createPrimaryAtlasProvider(tier: AtlasTier): AtlasVisionProvider {
  const name =
    tier === "free"
      ? process.env.ATLAS_PRIMARY_PROVIDER_FREE || process.env.ATLAS_PRIMARY_PROVIDER
      : process.env.ATLAS_PRIMARY_PROVIDER;
  return createAtlasVisionProvider(normalizeProviderName(name, "manual-only"));
}

export function createEscalateAtlasProvider(): AtlasVisionProvider {
  return createAtlasVisionProvider(
    normalizeProviderName(process.env.ATLAS_ESCALATE_PROVIDER, "manual-only"),
  );
}
