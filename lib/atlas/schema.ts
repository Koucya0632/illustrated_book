import { z } from "zod";

// What the vision model is asked to emit — only the fields it can actually
// judge. normalizedLabel / taxonomyNodeId / fine / attributes are server
// concerns and are filled in by the provider after parsing; keeping them out
// of the strict schema saves output tokens (strict mode forces every
// `required` field to be emitted, even as empty shells).
export const AtlasModelCandidateSchema = z.object({
  label: z.string().trim().min(1).max(80),
  zhHant: z.string().trim().max(80).nullable(),
  confidence: z.number().min(0).max(1),
});

export const AtlasModelOutputSchema = z.object({
  primary: z.array(AtlasModelCandidateSchema).max(5),
  uncertainty: z.object({
    reason: z.string().trim().max(240).nullable(),
    needsEscalation: z.boolean(),
  }),
});

export const ATLAS_MODEL_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["primary", "uncertainty"],
  properties: {
    primary: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "zhHant", "confidence"],
        properties: {
          label: { type: "string" },
          zhHant: { type: ["string", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
    uncertainty: {
      type: "object",
      additionalProperties: false,
      required: ["reason", "needsEscalation"],
      properties: {
        reason: { type: ["string", "null"] },
        needsEscalation: { type: "boolean" },
      },
    },
  },
} as const;
