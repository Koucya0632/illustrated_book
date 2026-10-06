import { z } from "zod";
import { recognitionUsage } from "./contracts";

const text = z.string().trim().min(1).max(4000);
const optionalText = z.string().max(4000).nullable();
const words = z.array(z.string().max(200)).max(50).optional();
const gloss = z.object({ mnemonic: optionalText.optional(), etymology: optionalText.optional() });
export const enrichmentDelivery = z.object({
  fields: z.object({
    pronunciation: optionalText, reading: optionalText,
    readingSegments: z.array(z.object({ text: z.string().max(200), ruby: optionalText })).max(200).nullable(),
    definitionTarget: text, definitionZh: text, definitionJa: text, definitionEn: text,
    displayJa: text, displayEn: text,
    enrichment: z.object({
      synonyms: words, antonyms: words, related: words,
      forms: z.array(z.object({ label: z.string().max(200), value: z.string().max(200) })).max(50).optional(),
      mnemonic: optionalText.optional(), etymology: optionalText.optional(),
      glossI18n: z.object({ ja: gloss.optional(), en: gloss.optional() }).optional(),
      targetDefinitionLang: z.enum(["en", "ja"]), enrichVersion: z.number().int().positive(),
    }),
  }),
  provider: z.string().min(1).max(100), model: z.string().max(200).nullable(),
  usage: recognitionUsage.optional(),
});
export type EnrichmentDelivery = z.infer<typeof enrichmentDelivery>;
