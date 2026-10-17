import { getCurrentUserIdFast } from "../../current-user";
import { getSql } from "../../db";
import { CreditError, userCreditConfig } from "../../credits/policy";
import { createCreditWallet } from "../../credits/wallet";
import { rateLimiter } from "../server";
import { createGrammarHandler } from "./http";
import { createGrammarModel } from "./model";
import { createGrammarStore } from "./store";

function sql() { const value = getSql(); if (!value) throw new CreditError("credits_unavailable"); return value; }
let model: ReturnType<typeof createGrammarModel> | undefined;
export const handleGrammarRequest = createGrammarHandler({
  userId: getCurrentUserIdFast, config: userCreditConfig,
  enabled: () => process.env.ASSISTANT_GRAMMAR_ENABLED === "true" &&
    process.env.ASSISTANT_AI_ENABLED === "true" && Boolean(process.env.ANTHROPIC_API_KEY),
  balance: account => createCreditWallet(sql()).readWallet(account),
  store: () => { const db = sql(); return createGrammarStore(db, createCreditWallet(db)); },
  generate: input => (model ??= createGrammarModel())(input),
  rateLimit: rateLimiter("assistant-grammar", 10, 300, "ASSISTANT_GRAMMAR_DAILY_GLOBAL", 5000),
  reportError: () => console.error("[grammar] request failed"),
});
