// 問 AI's request handler. The paid-step rules (who may ask, the ceiling
// check, charging once per request id, the usage row) live in `./paid`; this
// is what 問 AI does in between: ground the question in catalogue entries and
// charge only an in-scope answer.

import {
  ASSISTANT_MAX_BODY_BYTES, assistantAskInput,
  type AssistantAskInput, type AssistantModelReply, type AssistantModelRequest, type AssistantWord,
} from "./contracts";
import { createPaidHandler, type PaidDependencies } from "./paid";
import { ASSISTANT_PRICING, assistantPoints } from "./pricing";

export interface AssistantDependencies extends PaidDependencies {
  loadWords: (input: Pick<AssistantAskInput, "wordIds" | "uiLanguage" | "learningDirection">) => Promise<AssistantWord[]>;
  ask: (request: AssistantModelRequest) => Promise<AssistantModelReply>;
}

export function createAssistantHandler(deps: AssistantDependencies) {
  const handle = createPaidHandler<AssistantAskInput>(deps, {
    feature: "ask",
    pricingVersion: ASSISTANT_PRICING.version,
    pricing: { minPoints: ASSISTANT_PRICING.minPoints, maxPoints: ASSISTANT_PRICING.maxPoints },
    maxBodyBytes: ASSISTANT_MAX_BODY_BYTES,
    parse: raw => {
      const parsed = assistantAskInput.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
    chargeKey: requestId => `assistant:${requestId}`,
    produce: async body => {
      const words = await deps.loadWords(body);
      const reply = await deps.ask({
        question: body.question, uiLanguage: body.uiLanguage, learningDirection: body.learningDirection,
        words, history: body.history,
      });
      // Out of scope is the assistant declining, and a refusal is not a product.
      return {
        usage: reply.usage,
        billable: reply.inScope,
        points: assistantPoints(reply.usage),
        body: { answer: reply.answer, inScope: reply.inScope, wordIds: reply.wordIds },
      };
    },
  });
  return (request: Request, action: "offer" | "ask") => handle(request, action === "ask" ? "run" : "offer");
}
