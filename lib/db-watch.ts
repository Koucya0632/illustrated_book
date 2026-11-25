// Visibility into the shared postgres pool's transactions.
//
// On 2026-11-24 one instance's pool (max 15) stopped returning connections and
// every DB route on it hung for two hours, while Supabase saw nothing wrong.
// The leading suspicion is transactions holding connections while waiting for
// another pooled connection. This records every `sql.begin` so the next time it
// happens the logs say which transactions held connections, which waited, and
// for how long.
//
// Labels are the transaction's first SQL template with parameters elided: the
// production bundle is minified, so stack traces name nothing useful, and the
// template text carries no user data.

export interface OpenTransaction {
  label: string;
  startedAt: number;
  /** When the callback ran, i.e. a connection was granted; undefined while waiting. */
  acquiredAt?: number;
  /** Age thresholds already logged for this transaction. */
  logged: number;
}

export interface TransactionWatch {
  open: Map<number, OpenTransaction>;
  summary(now?: number): Record<string, unknown>;
  /** Log transactions that crossed a threshold since the last check. */
  check(now?: number): void;
}

type Log = (message: string, detail: Record<string, unknown>) => void;

// Each open transaction is logged once as it crosses each age.
const AGE_THRESHOLDS_MS = [10_000, 60_000, 240_000];
const SLOW_TRANSACTION_MS = 5_000;
const LABEL_LENGTH = 100;

function templateLabel(args: unknown[]): string | undefined {
  const first = args[0];
  if (Array.isArray(first) && "raw" in first) return first.join("$").replace(/\s+/g, " ").trim().slice(0, LABEL_LENGTH);
  if (typeof first === "string") return first.replace(/\s+/g, " ").trim().slice(0, LABEL_LENGTH);
  return undefined;
}

/**
 * Wraps `sql.begin` in place. The transaction callback receives a proxy of the
 * transaction handle that notes the first query's template; everything else
 * passes straight through.
 */
export function watchTransactions(
  sql: { begin: (...args: never[]) => Promise<unknown> },
  log: Log = (message, detail) => console.warn(message, JSON.stringify(detail)),
  clock: () => number = Date.now,
): TransactionWatch {
  const open = new Map<number, OpenTransaction>();
  let seq = 0;
  const original = sql.begin.bind(sql) as (...args: unknown[]) => Promise<unknown>;

  (sql as { begin: unknown }).begin = (...args: unknown[]) => {
    const fnIndex = args.findIndex((arg) => typeof arg === "function");
    if (fnIndex < 0) return original(...args);
    const id = ++seq;
    const entry: OpenTransaction = { label: "(no query yet)", startedAt: clock(), logged: 0 };
    let labelled = false;
    open.set(id, entry);
    const fn = args[fnIndex] as (tx: unknown) => unknown;
    const wrapped = [...args];
    wrapped[fnIndex] = (tx: object) => {
      entry.acquiredAt = clock();
      const note = (callArgs: unknown[]) => {
        if (labelled) return;
        const label = templateLabel(callArgs);
        if (label) { entry.label = label; labelled = true; }
      };
      const proxy = new Proxy(tx, {
        apply(target, thisArg, callArgs) {
          note(callArgs);
          return Reflect.apply(target as (...a: unknown[]) => unknown, thisArg, callArgs);
        },
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver);
          if (prop === "unsafe" && typeof value === "function") {
            return (...callArgs: unknown[]) => { note(callArgs); return value.apply(target, callArgs); };
          }
          return value;
        },
      });
      return fn(proxy);
    };
    return original(...wrapped).finally(() => {
      open.delete(id);
      const end = clock();
      const total = end - entry.startedAt;
      if (total >= SLOW_TRANSACTION_MS) {
        log("[db] slow transaction", {
          label: entry.label,
          totalMs: total,
          waitedMs: (entry.acquiredAt ?? end) - entry.startedAt,
          open: open.size,
        });
      }
    });
  };

  const summary = (now = clock()) => {
    const entries = [...open.values()];
    const waiting = entries.filter((e) => e.acquiredAt === undefined);
    const holding = entries.filter((e) => e.acquiredAt !== undefined);
    return {
      open: entries.length,
      waiting: waiting.length,
      holding: holding.length,
      oldest: entries
        .sort((a, b) => a.startedAt - b.startedAt)
        .slice(0, 5)
        .map((e) => ({
          label: e.label,
          ageMs: now - e.startedAt,
          state: e.acquiredAt === undefined ? "waiting" : "holding",
        })),
    };
  };

  const check = (now = clock()) => {
    let crossed = false;
    for (const entry of open.values()) {
      const age = now - entry.startedAt;
      while (entry.logged < AGE_THRESHOLDS_MS.length && age >= AGE_THRESHOLDS_MS[entry.logged]) {
        entry.logged++;
        crossed = true;
      }
    }
    if (crossed) log("[db] long-open transactions", summary(now));
  };

  return { open, summary, check };
}
