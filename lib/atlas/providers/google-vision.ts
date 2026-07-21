import {
  emptyRecognitionResult,
  type AtlasRecognitionResult,
  type AtlasVisionInput,
  type AtlasVisionProvider,
} from "../vision-provider";
import { normalizeAtlasLabel } from "../normalize";

interface GoogleVisionResponse {
  responses?: Array<{
    labelAnnotations?: Array<{
      description?: string;
      score?: number;
    }>;
    localizedObjectAnnotations?: Array<{
      name?: string;
      score?: number;
    }>;
    error?: {
      message?: string;
    };
  }>;
}

/// Batch-translate English labels via Google Translate v2 (zh-TW for the
/// gloss, ja for the target term), reusing the same API key as Vision.
/// Returns label -> translation. Fails soft: on any error the map is empty
/// and callers fall back (zhHant = null / English label).
async function translateLabels(
  labels: string[],
  apiKey: string,
  target: "zh-TW" | "ja",
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = Array.from(new Set(labels.filter(Boolean)));
  if (unique.length === 0) return out;
  try {
    const res = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: unique, source: "en", target, format: "text" }),
      },
    );
    if (!res.ok) return out;
    const json = (await res.json()) as {
      data?: { translations?: Array<{ translatedText?: string }> };
    };
    const translations = json.data?.translations ?? [];
    unique.forEach((label, i) => {
      const text = translations[i]?.translatedText?.trim();
      if (text) out.set(label, text);
    });
  } catch {
    // graceful — leave zhHant null
  }
  return out;
}

export class GoogleVisionAtlasProvider implements AtlasVisionProvider {
  name = "google-vision";

  async recognizePrimary(input: AtlasVisionInput): Promise<AtlasRecognitionResult> {
    const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
    if (!apiKey) {
      return emptyRecognitionResult(this.name, "primary", "GOOGLE_CLOUD_VISION_API_KEY is not configured");
    }
    const t0 = performance.now();
    const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: input.imageBytes.toString("base64") },
            features: [
              { type: "LABEL_DETECTION", maxResults: 8 },
              { type: "OBJECT_LOCALIZATION", maxResults: 8 },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`Google Vision HTTP ${res.status}`);
    }
    const raw = (await res.json()) as GoogleVisionResponse;
    const first = raw.responses?.[0];
    if (first?.error?.message) throw new Error(first.error.message);

    const merged = new Map<string, { label: string; confidence: number }>();
    for (const row of first?.localizedObjectAnnotations ?? []) {
      const label = row.name?.trim();
      if (!label) continue;
      const key = normalizeAtlasLabel(label);
      const confidence = Math.max(0, Math.min(1, Number(row.score) || 0));
      const prev = merged.get(key);
      if (!prev || confidence > prev.confidence) merged.set(key, { label, confidence });
    }
    for (const row of first?.labelAnnotations ?? []) {
      const label = row.description?.trim();
      if (!label) continue;
      const key = normalizeAtlasLabel(label);
      const confidence = Math.max(0, Math.min(1, Number(row.score) || 0));
      const prev = merged.get(key);
      if (!prev || confidence > prev.confidence) merged.set(key, { label, confidence });
    }

    const ranked = Array.from(merged.entries())
      .sort((a, b) => b[1].confidence - a[1].confidence)
      .slice(0, 5);
    // Vision labels are English. Translate them to Japanese whenever Japanese
    // is needed either as the atlas label or as the interface-language gloss.
    // The zh-TW gloss rides along either way.
    const names = ranked.map(([, value]) => value.label);
    const [zhMap, jaMap] = await Promise.all([
      translateLabels(names, apiKey, "zh-TW"),
      input.targetLanguage === "ja" || input.glossLanguage === "ja"
        ? translateLabels(names, apiKey, "ja")
        : Promise.resolve(new Map<string, string>()),
    ]);
    const primary = ranked.map(([, value]) => {
      const label =
        input.targetLanguage === "ja"
          ? jaMap.get(value.label) ?? value.label
          : value.label;
      const gloss =
        input.glossLanguage === "en"
          ? value.label
          : input.glossLanguage === "ja"
          ? jaMap.get(value.label) ?? null
          : null;
      return {
        label,
        normalizedLabel: normalizeAtlasLabel(label),
        zhHant: zhMap.get(value.label) ?? null,
        gloss,
        confidence: value.confidence,
        taxonomyNodeId: null,
      };
    });
    const top = primary[0]?.confidence ?? 0;
    const second = primary[1]?.confidence ?? 0;
    return {
      provider: this.name,
      model: "google-vision-label-object",
      stage: "primary",
      primary,
      fine: [],
      attributes: { colors: [], scene: null, count: null },
      uncertainty: {
        reason: primary.length === 0 ? "no labels returned" : top < 0.65 || top - second < 0.12 ? "low confidence" : null,
        needsEscalation: primary.length === 0 || top < 0.65 || top - second < 0.12,
      },
      usage: {
        imageCount: 1,
        latencyMs: Math.round(performance.now() - t0),
      },
      raw,
    };
  }

  async recognizeFine(input: AtlasVisionInput): Promise<AtlasRecognitionResult> {
    void input;
    return emptyRecognitionResult(this.name, "fine", "google vision fine recognition is not supported");
  }
}
