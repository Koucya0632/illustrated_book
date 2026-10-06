import { z } from "zod";

export const recognitionQuoteInput = z.object({
  imageId: z.string().uuid(),
  feature: z.enum(["atlas.recognize.primary", "atlas.recognize.precision"]),
  targetLanguage: z.enum(["en", "ja"]),
  glossLanguage: z.enum(["en", "ja"]).nullable().default(null),
}).strict();
export type RecognitionInput = z.infer<typeof recognitionQuoteInput>;
export const acceptQuoteInput = z.object({ quoteId: z.string().uuid() }).strict();
const correctedName = z.string().trim().min(1).max(120);
/** Manual correction rides on the confirm; omitted fields keep the candidate's values. */
export const confirmCandidateInput = z.object({
  candidateId: z.string().uuid(),
  lemma: correctedName.optional(),
  displayZhHant: correctedName.optional(),
  displayGloss: correctedName.nullable().optional(),
}).strict();
export type CandidateCorrection = Omit<z.infer<typeof confirmCandidateInput>, "candidateId">;

const candidate = z.object({
  label: z.string().trim().min(1).max(120),
  normalizedLabel: z.string().trim().min(1).max(120),
  zhHant: z.string().trim().min(1).max(120),
  gloss: z.string().trim().max(120).nullable(),
  confidence: z.number().min(0).max(1),
  taxonomyNodeId: z.string().max(200).nullable(),
});
export const recognitionUsage = z.object({
  inputTokens: z.number().int().min(0).optional(), outputTokens: z.number().int().min(0).optional(),
  imageCount: z.number().int().min(0).optional(), estimatedCostUsd: z.number().min(0).optional(),
  latencyMs: z.number().min(0),
});
/** Missing basic meaning, empty candidates and oversized results are not delivery. */
export const recognitionDelivery = z.object({
  provider: z.string().min(1).max(100), model: z.string().max(200).nullable(),
  stage: z.enum(["primary", "escalated"]),
  primary: z.array(candidate).max(30), fine: z.array(candidate).max(30),
  attributes: z.object({ colors: z.array(z.string().max(100)).max(30), scene: z.string().max(200).nullable(), count: z.number().int().min(0).nullable() }),
  uncertainty: z.object({ reason: z.string().max(1000).nullable(), needsEscalation: z.boolean() }),
  usage: recognitionUsage.optional(),
}).refine(result => result.primary.length + result.fine.length > 0);
export type RecognitionDelivery = z.infer<typeof recognitionDelivery>;

export type OperationErrorCode = "invalid_ai_request" | "quote_not_found" | "quote_expired"
  | "operation_not_found" | "image_not_found" | "image_changed" | "capacity_full"
  | "operation_busy" | "operation_not_committed" | "stale_attempt" | "invalid_ai_result" | "rate_limited";
export class OperationError extends Error {
  constructor(public readonly code: OperationErrorCode) { super(code); }
}

export const OPERATION_TIMING = {
  quoteMs: 5 * 60_000,
  leaseMs: 90_000,
  reconcileMs: 15 * 60_000,
  confirmationMs: 30 * 60_000,
  minimumExecutionMs: 60_000,
} as const;
