import {
  emptyRecognitionResult,
  type AtlasRecognitionResult,
  type AtlasVisionInput,
  type AtlasVisionProvider,
} from "../vision-provider";
import { ATLAS_MODEL_OUTPUT_JSON_SCHEMA, AtlasModelOutputSchema } from "../schema";
import { normalizeAtlasLabel } from "../normalize";

interface OpenAIResponse {
  output_text?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  error?: { code?: string; message?: string } | null;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

function extractText(raw: OpenAIResponse): string {
  if (typeof raw.output_text === "string") return raw.output_text;
  for (const item of raw.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string" && content.text.trim()) return content.text;
    }
  }
  return "";
}

// Structured-output requests can come back HTTP 200 with no JSON text: the model
// may refuse (regulated/sensitive subject, e.g. a tobacco product) or the
// response may be truncated. Surface those distinctly instead of collapsing them
// into a confusing "did not contain valid JSON".
function extractRefusal(raw: OpenAIResponse): string {
  for (const item of raw.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "refusal" && typeof content.refusal === "string" && content.refusal.trim()) {
        return content.refusal.trim();
      }
    }
  }
  return "";
}

function modelFor(stage: "primary" | "fine" | "escalated"): string | null {
  if (stage === "escalated") return process.env.ATLAS_OPENAI_ESCALATE_MODEL || null;
  return process.env.ATLAS_OPENAI_FINE_MODEL || null;
}

// USD per 1M tokens (input, output), for the estimated-cost column in the
// admin funnel. Longest-prefix entries ("-mini" / "-nano") must come before
// their base model. Unknown models just skip the estimate.
const MODEL_PRICES_PER_MTOK: Array<[prefix: string, input: number, output: number]> = [
  ["gpt-4o-mini", 0.15, 0.6],
  ["gpt-4o", 2.5, 10],
  ["gpt-4.1-mini", 0.4, 1.6],
  ["gpt-4.1-nano", 0.1, 0.4],
  ["gpt-4.1", 2, 8],
  ["gpt-5-mini", 0.25, 2],
  ["gpt-5-nano", 0.05, 0.4],
  ["gpt-5", 1.25, 10],
];

function estimateCostUsd(
  model: string,
  inputTokens: number | undefined,
  outputTokens: number | undefined,
): number | undefined {
  const price = MODEL_PRICES_PER_MTOK.find(([prefix]) => model.startsWith(prefix));
  if (!price || (inputTokens == null && outputTokens == null)) return undefined;
  const usd = ((inputTokens ?? 0) * price[1] + (outputTokens ?? 0) * price[2]) / 1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

function detailFor(stage: "primary" | "fine" | "escalated"): "low" | "high" | "auto" {
  const raw =
    stage === "escalated"
      ? process.env.ATLAS_OPENAI_ESCALATE_DETAIL
      : process.env.ATLAS_OPENAI_DEFAULT_DETAIL;
  return raw === "high" || raw === "auto" ? raw : "low";
}

export class OpenAIDirectAtlasProvider implements AtlasVisionProvider {
  name = "openai-direct";

  async recognizePrimary(input: AtlasVisionInput): Promise<AtlasRecognitionResult> {
    return this.recognize(input, "primary");
  }

  async recognizeFine(input: AtlasVisionInput): Promise<AtlasRecognitionResult> {
    return this.recognize(input, "fine");
  }

  async recognizeEscalated(input: AtlasVisionInput): Promise<AtlasRecognitionResult> {
    return this.recognize(input, "escalated");
  }

  private async recognize(
    input: AtlasVisionInput,
    stage: "primary" | "fine" | "escalated",
  ): Promise<AtlasRecognitionResult> {
    if (!process.env.OPENAI_API_KEY) {
      return emptyRecognitionResult(this.name, stage, "OPENAI_API_KEY is not configured");
    }
    const model = modelFor(stage);
    if (!model) {
      return emptyRecognitionResult(
        this.name,
        stage,
        stage === "escalated"
          ? "ATLAS_OPENAI_ESCALATE_MODEL is not configured"
          : "ATLAS_OPENAI_FINE_MODEL is not configured",
      );
    }

    const t0 = performance.now();
    const dataUrl = `data:${input.mimeType};base64,${input.imageBytes.toString("base64")}`;
    // The learner studies the target language, so `label` must be in it —
    // e.g. for ja a confirmed candidate becomes the item's lemma, which
    // downstream feeds generateJapaneseReading and must be actual Japanese.
    const languageName = input.targetLanguage === "ja" ? "Japanese" : "English";
    const prompt = [
      `Identify the single main object in this image as ${languageName} vocabulary for a Chinese-speaking language learner.`,
      "Read any visible text, brand, or label on the object and use it to name it as specifically as a learner would in everyday life.",
      "Return a granularity ladder of up to 4 candidate names for the SAME object, from the basic everyday word to progressively more specific everyday descriptors that are clearly visible — e.g. variety, colour, age/size, type, material, breed, or brand. Examples: 'coffee' -> 'canned coffee' -> 'canned latte'; 'cat' -> 'black cat' -> 'kitten' (only if visibly young); 'shoe' -> 'sneaker'.",
      "Only add a finer rung when you can actually see evidence for it; never invent a breed, brand, or variety you cannot read or clearly see. It is fine to return only one candidate when nothing finer is visually supported.",
      `Order most-specific / most-likely first. Put all candidates in \`primary\`, each with a \`label\` in ${languageName} (the word the learner will study), a Traditional Chinese \`zhHant\` gloss, and \`confidence\` between 0 and 1.`,
      input.targetLanguage === "ja"
        ? "Write Japanese labels in their standard everyday written form (kanji/kana as commonly written; no romaji)."
        : "",
      "Do not identify people. Do not infer sensitive attributes. Only return candidates that are visually supported.",
      input.primaryHint ? `Primary hint from cheaper classifier: ${input.primaryHint}` : "",
    ].filter(Boolean).join("\n");

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: dataUrl, detail: detailFor(stage) },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "atlas_recognition",
            strict: true,
            schema: ATLAS_MODEL_OUTPUT_JSON_SCHEMA,
          },
        },
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`OpenAI Responses HTTP ${res.status}${errText ? `: ${errText.slice(0, 240)}` : ""}`);
    }
    const raw = (await res.json()) as OpenAIResponse;
    if (raw.error?.message) {
      throw new Error(`OpenAI Responses error: ${raw.error.message}`);
    }
    const text = extractText(raw);
    if (!text) {
      const refusal = extractRefusal(raw);
      if (refusal) {
        throw new Error("模型拒絕辨識此影像（可能含受管制或敏感內容）。請改用「AI 識別」或手動輸入名稱。");
      }
      if (raw.status === "incomplete") {
        throw new Error(
          `高精度辨識回應不完整（${raw.incomplete_details?.reason ?? "回應被截斷"}），請重試或改用「AI 識別」。`,
        );
      }
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      throw new Error("OpenAI response did not contain valid JSON");
    }
    const parsed = AtlasModelOutputSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new Error("OpenAI recognition JSON failed validation");
    }
    // The model only emits label/zhHant/confidence; the remaining candidate
    // and result fields are server-side concerns filled here.
    const primary = parsed.data.primary.map((candidate) => ({
      ...candidate,
      normalizedLabel: normalizeAtlasLabel(candidate.label),
      taxonomyNodeId: null,
    }));
    return {
      provider: this.name,
      model,
      stage,
      primary,
      fine: [],
      attributes: { colors: [], scene: null, count: null },
      uncertainty: parsed.data.uncertainty,
      usage: {
        inputTokens: raw.usage?.input_tokens,
        outputTokens: raw.usage?.output_tokens,
        imageCount: 1,
        estimatedCostUsd: estimateCostUsd(model, raw.usage?.input_tokens, raw.usage?.output_tokens),
        latencyMs: Math.round(performance.now() - t0),
      },
      raw,
    };
  }
}
