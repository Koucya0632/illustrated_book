import { getCurrentUserIdFast } from "../../current-user";
import { getSql } from "../../db";
import { CreditError, userCreditConfig } from "../../credits/policy";
import { createCreditWallet } from "../../credits/wallet";
import { rateLimiter } from "../server";
import { createVocabularyHandler } from "./http";
import { createVocabularyModel } from "./model";
import { createVocabularyStore } from "./store";

function sql() { const value = getSql(); if (!value) throw new CreditError("credits_unavailable"); return value; }
let model: ReturnType<typeof createVocabularyModel> | undefined;
export const handleVocabularyRequest = createVocabularyHandler({
  userId: getCurrentUserIdFast, config: userCreditConfig,
  enabled: () => process.env.ASSISTANT_VOCABULARY_ENABLED === "true" &&
    process.env.ASSISTANT_AI_ENABLED === "true" && Boolean(process.env.ANTHROPIC_API_KEY),
  balance: account => createCreditWallet(sql()).readWallet(account),
  store: () => { const db = sql(); return createVocabularyStore(db, createCreditWallet(db)); },
  generate: input => (model ??= createVocabularyModel())(input),
  rateLimit: rateLimiter("assistant-vocabulary", 10, 300, "ASSISTANT_VOCABULARY_DAILY_GLOBAL", 5000),
  reportError: () => console.error("[vocabulary] request failed"),
});
