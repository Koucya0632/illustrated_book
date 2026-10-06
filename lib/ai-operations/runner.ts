import { OperationError } from "./contracts";
import type { AiOperations, WorkLease } from "./service";
import type { CreditAccount } from "../credits/wallet";
import { CreditError } from "../credits/policy";

interface Dependencies<Input> {
  prepare: (lease: WorkLease) => Promise<Input>;
  execute: (input: Input, lease: WorkLease) => Promise<unknown>;
  timeoutMs?: number;
  heartbeatMs?: number;
}

/** Awaited worker only. No provider retry after an ambiguous response or process crash. */
export function createAiRunner<Input>(operations: AiOperations, deps: Dependencies<Input>) {
  return async (account: CreditAccount, id: string) => {
    const lease = await operations.claimWork(account, id);
    if (!lease) return "idle" as const;
    let providerStarted = false, stopped = false;
    let observedUsage: unknown;
    let pendingHeartbeat: Promise<void> | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const interval = setInterval(() => {
      if (pendingHeartbeat) return;
      pendingHeartbeat = operations.heartbeat(account, id, lease.token)
        .catch(() => { /* The final write still checks the authoritative lease. */ })
        .finally(() => { pendingHeartbeat = null; });
    }, deps.heartbeatMs ?? 15_000);
    try {
      if (!lease.stagedResult) {
        const deadline = new Promise<never>((_, reject) => {
          timeout = setTimeout(() => { stopped = true; reject(new Error("worker_timeout")); }, deps.timeoutMs ?? 40_000);
        });
        const computation = (async () => {
          const input = await deps.prepare(lease);
          // A late download must not start an AI request after the worker timed out.
          if (stopped) throw new Error("worker_timeout");
          providerStarted = true;
          return deps.execute(input, lease);
        })();
        const result = await Promise.race([computation, deadline]);
        if (typeof result === "object" && result !== null && "usage" in result) observedUsage = result.usage;
        clearTimeout(timeout);
        await operations.stageResult(account, id, lease.token, result);
      }
      const result = await operations.commit(account, id, lease.token);
      return result.state === "committed" ? "committed" as const : "released" as const;
    } catch (error) {
      if (error instanceof OperationError && error.code === "stale_attempt") return "reconciling" as const;
      if (error instanceof CreditError && error.code === "credits_reconciliation_required") {
        await operations.fail(account, id, lease.token, "refund_received");
        return "released" as const;
      }
      if (error instanceof OperationError && error.code === "rate_limited") {
        await operations.fail(account, id, lease.token, "rate_limited");
        return "released" as const;
      }
      if (error instanceof OperationError && error.code === "invalid_ai_result") {
        await operations.fail(account, id, lease.token, "invalid_ai_result", observedUsage);
        return "released" as const;
      }
      if (!providerStarted && !lease.stagedResult) {
        await operations.fail(account, id, lease.token, error instanceof OperationError && error.code === "rate_limited" ? "rate_limited" : "input_unavailable");
        return "released" as const;
      }
      await operations.markUncertain(account, id, lease.token);
      return "reconciling" as const;
    } finally {
      stopped = true;
      clearTimeout(timeout);
      clearInterval(interval);
      if (pendingHeartbeat) await pendingHeartbeat;
    }
  };
}
