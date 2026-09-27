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

/// Whether a recognition gave the user anything to pick. Written as the
/// `success` flag of its user_atlas_ai_usage row, and getAtlasUsage counts only
/// successful rows — so an empty result (no labels, manual-only provider) does
/// not use up the monthly quota (membership rule, decided 2026-09-27).
export function recognitionFoundSomething(result: AtlasRecognitionResult): boolean {
  return result.primary.length > 0 || result.fine.length > 0;
}
