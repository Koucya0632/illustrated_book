import { getCurrentUserIdFast } from "@/lib/current-user";
import { getSql } from "@/lib/db";
import { userCreditConfig, CreditError } from "./policy";
import { createCreditWallet } from "./wallet";
import { createCreditHandler } from "./http";

export const handleCreditRequest = createCreditHandler({
  currentUserId: getCurrentUserIdFast,
  config: userCreditConfig,
  wallet: () => {
    const sql = getSql();
    if (!sql) throw new CreditError("credits_unavailable");
    return createCreditWallet(sql);
  },
  reportError: () => console.error("[credits] request failed; no successful credit result returned"),
});
