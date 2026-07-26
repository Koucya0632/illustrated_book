// Machine moderation for public 圖鑑 submissions (docs/COMMUNITY_ATLAS_PLAN.md §5).
//
// Policy: a machine gate that runs once at submit time. Clean items auto-publish
// (so it *feels* like post-moderation), risky ones go to the human queue, and
// hard categories never reach the public feed. Human review only handles the
// flagged minority — the point is to remove the per-item human bottleneck
// without letting irreversible content (faces, IDs, NSFW) go live.
//
// Fails CLOSED: unlike entitlement.ts (which fails open so an outage never
// blocks the product), a classifier outage sends the item to human review.
// Slow is acceptable here; publishing a violation is not.
//
// Cost: one Vision call per submission (SafeSearch + FACE + OCR in a single
// annotate request). Dedupe by image hash upstream so re-submits don't re-bill.

import type { AtlasModerationPhase, AtlasModerationVerdict } from "./types";

/** Categories that must never auto-publish, even at low confidence. */
export const ATLAS_HARD_CATEGORIES = ["nsfw", "violence", "face", "pii"] as const;
export type AtlasModerationCategory =
  | (typeof ATLAS_HARD_CATEGORIES)[number]
  | "spam"
  | "text_abuse";

export interface AtlasModerationHit {
  category: AtlasModerationCategory;
  /** 0–1. Google likelihood buckets are mapped onto this scale. */
  score: number;
}

export interface AtlasModerationOutcome {
  verdict: AtlasModerationVerdict;
  /** Review status the caller should persist. */
  reviewStatus: "approved" | "pending_review" | "rejected";
  hits: AtlasModerationHit[];
  /** Set when the classifiers could not run (fail-closed → human review). */
  degraded: boolean;
}

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined || raw === "" ? fallback : Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

/**
 * Soft threshold → human review. Hard threshold → auto-reject.
 *
 * Hard rejection is OFF by default (ATLAS_MOD_HARD_REJECT): the rollout plan is
 * to observe real flag rates with everything routed to humans first, then turn
 * auto-reject on once the thresholds are calibrated.
 */
export function atlasModerationThresholds() {
  return {
    soft: numEnv("ATLAS_MOD_SOFT_THRESHOLD", 0.5),
    hard: numEnv("ATLAS_MOD_HARD_THRESHOLD", 0.9),
    hardRejectEnabled: boolEnv("ATLAS_MOD_HARD_REJECT", false),
    enabled: boolEnv("ATLAS_MOD_ENABLED", true),
  };
}

// Google Vision SafeSearch returns likelihood buckets, not numbers.
const LIKELIHOOD_SCORE: Record<string, number> = {
  UNKNOWN: 0,
  VERY_UNLIKELY: 0,
  UNLIKELY: 0.2,
  POSSIBLE: 0.5,
  LIKELY: 0.8,
  VERY_LIKELY: 0.95,
};

interface VisionSafeSearch {
  adult?: string;
  violence?: string;
  racy?: string;
  medical?: string;
  spoof?: string;
}

interface VisionModerationResponse {
  responses?: {
    safeSearchAnnotation?: VisionSafeSearch;
    faceAnnotations?: { detectionConfidence?: number }[];
    fullTextAnnotation?: { text?: string };
    error?: { message?: string };
  }[];
}

/**
 * PII patterns for OCR'd text. Atlas users photograph menus, receipts, forms and
 * residence cards, so leaked personal data is a likelier failure mode here than
 * nudity. Anything matching goes to a human — never auto-published.
 */
const PII_PATTERNS: RegExp[] = [
  /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/, // card-like 16 digit
  /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/, // email
  /\b(?:\+?\d{1,3}[ -]?)?(?:\(\d{2,4}\)|\d{2,4})[ -]?\d{3,4}[ -]?\d{3,4}\b/, // phone
  /[A-Z]{2}\d{6,10}/, // passport / residence-card style id
  /マイナンバー|在留カード|個人番号|パスポート番号/,
];

export function detectPiiInText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return PII_PATTERNS.some((re) => re.test(trimmed));
}

/** Maps raw classifier signals onto category hits. Pure — unit tested. */
export function scoreVisionModeration(input: {
  safeSearch?: VisionSafeSearch;
  faceConfidences?: number[];
  ocrText?: string;
}): AtlasModerationHit[] {
  const hits: AtlasModerationHit[] = [];

  const adult = LIKELIHOOD_SCORE[input.safeSearch?.adult ?? "UNKNOWN"] ?? 0;
  const racy = LIKELIHOOD_SCORE[input.safeSearch?.racy ?? "UNKNOWN"] ?? 0;
  const nsfw = Math.max(adult, racy);
  if (nsfw > 0) hits.push({ category: "nsfw", score: nsfw });

  const violence = LIKELIHOOD_SCORE[input.safeSearch?.violence ?? "UNKNOWN"] ?? 0;
  if (violence > 0) hits.push({ category: "violence", score: violence });

  // Any confidently detected face is a privacy/likeness question for a human,
  // regardless of how "safe" the photo is.
  const face = Math.max(0, ...(input.faceConfidences ?? [0]));
  if (face > 0) hits.push({ category: "face", score: face });

  if (input.ocrText && detectPiiInText(input.ocrText)) {
    hits.push({ category: "pii", score: 1 });
  }

  return hits;
}

/** Applies thresholds to hits. Pure — unit tested. */
export function decideAtlasModeration(
  hits: AtlasModerationHit[],
  opts?: { degraded?: boolean },
): AtlasModerationOutcome {
  const { soft, hard, hardRejectEnabled } = atlasModerationThresholds();

  if (opts?.degraded) {
    return { verdict: "flagged", reviewStatus: "pending_review", hits, degraded: true };
  }

  const significant = hits.filter((h) => h.score >= soft);

  if (hardRejectEnabled) {
    const hardHit = significant.find(
      (h) =>
        h.score >= hard &&
        (ATLAS_HARD_CATEGORIES as readonly string[]).includes(h.category) &&
        // Faces and PII are never auto-rejected: a human decides, because the
        // photo may be perfectly fine (a poster, a crowd in the background).
        h.category !== "face" &&
        h.category !== "pii",
    );
    if (hardHit) {
      return { verdict: "rejected", reviewStatus: "rejected", hits, degraded: false };
    }
  }

  if (significant.length > 0) {
    return { verdict: "flagged", reviewStatus: "pending_review", hits, degraded: false };
  }

  return { verdict: "approved", reviewStatus: "approved", hits, degraded: false };
}

/**
 * Runs the image classifiers. One Vision annotate call covering SafeSearch,
 * face detection and OCR. Throws nothing: any failure returns degraded=true so
 * the caller routes to human review.
 */
export async function runAtlasImageModeration(
  imageBytes: Buffer,
): Promise<AtlasModerationOutcome> {
  const { enabled } = atlasModerationThresholds();
  if (!enabled) {
    // Kill switch: behave exactly like the pre-moderation era (everything to
    // the human queue) rather than silently publishing.
    return { verdict: "flagged", reviewStatus: "pending_review", hits: [], degraded: true };
  }

  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) {
    return { verdict: "flagged", reviewStatus: "pending_review", hits: [], degraded: true };
  }

  try {
    const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: imageBytes.toString("base64") },
            features: [
              { type: "SAFE_SEARCH_DETECTION" },
              { type: "FACE_DETECTION", maxResults: 5 },
              { type: "TEXT_DETECTION", maxResults: 1 },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Vision moderation HTTP ${res.status}`);

    const raw = (await res.json()) as VisionModerationResponse;
    const first = raw.responses?.[0];
    if (first?.error?.message) throw new Error(first.error.message);

    const hits = scoreVisionModeration({
      safeSearch: first?.safeSearchAnnotation,
      faceConfidences: (first?.faceAnnotations ?? [])
        .map((f) => Number(f.detectionConfidence) || 0)
        .filter((n) => n > 0),
      ocrText: first?.fullTextAnnotation?.text ?? "",
    });

    return decideAtlasModeration(hits);
  } catch {
    // Fail closed — see file header.
    return { verdict: "flagged", reviewStatus: "pending_review", hits: [], degraded: true };
  }
}

/** Text fields submitted alongside the image (lemma, gloss, note, attribution). */
export function runAtlasTextModeration(fields: (string | null | undefined)[]): AtlasModerationHit[] {
  const joined = fields.filter(Boolean).join("\n");
  const hits: AtlasModerationHit[] = [];
  if (detectPiiInText(joined)) hits.push({ category: "pii", score: 1 });
  if (/https?:\/\/|www\./i.test(joined)) hits.push({ category: "spam", score: 0.8 });
  return hits;
}

export type { AtlasModerationPhase };
