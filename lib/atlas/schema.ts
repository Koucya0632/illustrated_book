import { z } from "zod";

export const AtlasCandidateSchema = z.object({
  label: z.string().trim().min(1).max(80),
  normalizedLabel: z.string().trim().min(1).max(80),
  zhHant: z.string().trim().max(80).nullable(),
  confidence: z.number().min(0).max(1),
  taxonomyNodeId: z.string().trim().max(120).nullable(),
});

export const AtlasRecognitionResultSchema = z.object({
  primary: z.array(AtlasCandidateSchema).max(5),
  fine: z.array(AtlasCandidateSchema).max(8),
  attributes: z.object({
    colors: z.array(z.string().trim().max(40)).max(5),
    scene: z.string().trim().max(120).nullable(),
    count: z.number().int().min(0).max(100).nullable(),
  }),
  uncertainty: z.object({
    reason: z.string().trim().max(240).nullable(),
    needsEscalation: z.boolean(),
  }),
});

export const ATLAS_RECOGNITION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["primary", "fine", "attributes", "uncertainty"],
  properties: {
    primary: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "normalizedLabel", "zhHant", "confidence", "taxonomyNodeId"],
        properties: {
          label: { type: "string" },
          normalizedLabel: { type: "string" },
          zhHant: { type: ["string", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          taxonomyNodeId: { type: ["string", "null"] },
        },
      },
    },
    fine: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "normalizedLabel", "zhHant", "confidence", "taxonomyNodeId"],
        properties: {
          label: { type: "string" },
          normalizedLabel: { type: "string" },
          zhHant: { type: ["string", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          taxonomyNodeId: { type: ["string", "null"] },
        },
      },
    },
    attributes: {
      type: "object",
      additionalProperties: false,
      required: ["colors", "scene", "count"],
      properties: {
        colors: {
          type: "array",
          maxItems: 5,
          items: { type: "string" },
        },
        scene: { type: ["string", "null"] },
        count: { type: ["integer", "null"], minimum: 0, maximum: 100 },
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
