import type { CreditAccount } from "../credits/wallet";
import { OperationError } from "./contracts";
import type { Fulfillments, FulfillmentLease } from "./fulfillment";

export function createFulfillmentRunner(service: Fulfillments, execute: (lease: FulfillmentLease) => Promise<unknown>, timeoutMs = 40_000) {
  return async (a: CreditAccount, id: string) => {
    const lease = await service.claim(a, id);
    if (!lease) return "idle";
    let timer: ReturnType<typeof setTimeout> | undefined;
    let usage: unknown;
    try {
      if (!lease.stagedResult) {
        const deadline = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("fulfillment_timeout")), timeoutMs);
        });
        const result = await Promise.race([execute(lease), deadline]);
        clearTimeout(timer);
        if (result && typeof result === "object" && "usage" in result) usage = result.usage;
        await service.stage(a, id, lease.token, result);
      }
      return await service.commit(a, id, lease.token);
    } catch (error) {
      if (error instanceof OperationError && error.code === "stale_attempt") return "reconciling";
      const invalid = error instanceof OperationError && error.code === "invalid_ai_result";
      return service.fail(a, id, lease.token, invalid ? "invalid_ai_result" : "result_uncertain", !invalid, usage);
    } finally { clearTimeout(timer); }
  };
}
