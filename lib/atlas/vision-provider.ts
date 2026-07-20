import type { AtlasCandidate, AtlasRecognitionStage, AtlasTargetLanguage } from "./types";

export interface AtlasTaxonomyHint {
  id: string;
  en: string;
  zhHant: string;
  aliases: string[];
  parentId: string | null;
}

export interface AtlasVisionInput {
  imageBytes: Buffer;
  mimeType: string;
  targetLanguage: AtlasTargetLanguage;
  /// The capturing user's UI language when it needs its own candidate gloss:
  /// "ja"/"en" UIs whose language differs from targetLanguage. Chinese UIs
  /// (zhHant is their gloss) and UI==target (the label is the gloss) pass
  /// null, and the model is told to leave `gloss` null.
  glossLanguage?: "ja" | "en" | null;
  taxonomyHint?: AtlasTaxonomyHint[];
  primaryHint?: string;
}

export interface AtlasRecognitionResult {
  provider: string;
  model: string | null;
  stage: AtlasRecognitionStage;
  primary: AtlasCandidate[];
  fine: AtlasCandidate[];
  attributes: {
    colors: string[];
    scene: string | null;
    count: number | null;
  };
  uncertainty: {
    reason: string | null;
    needsEscalation: boolean;
  };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    imageCount?: number;
    estimatedCostUsd?: number;
    latencyMs: number;
  };
  raw?: unknown;
}

export interface AtlasVisionProvider {
  name: string;
  recognizePrimary(input: AtlasVisionInput): Promise<AtlasRecognitionResult>;
  recognizeFine(input: AtlasVisionInput): Promise<AtlasRecognitionResult>;
  recognizeEscalated?(input: AtlasVisionInput): Promise<AtlasRecognitionResult>;
}

export function emptyRecognitionResult(
  provider: string,
  stage: AtlasRecognitionStage,
  reason: string,
): AtlasRecognitionResult {
  return {
    provider,
    model: null,
    stage,
    primary: [],
    fine: [],
    attributes: { colors: [], scene: null, count: null },
    uncertainty: { reason, needsEscalation: false },
  };
}
