// A time limit for a group of queries. postgres.js has no per-query timeout,
// so a query sent on a connection that never answers waits until Cloud Run
// cuts the request off (150s). `run` gives up after `ms`, cancels whatever is
// still out, and says which labels were still pending.

type Cancellable = { cancel?: () => void };

export class DeadlineError extends Error {
  constructor(
    readonly pending: string[],
    readonly ms: number,
  ) {
    super(`deadline of ${ms}ms passed; pending: ${pending.join(", ") || "none"}`);
    this.name = "DeadlineError";
  }
}

export type Track = <T>(label: string, work: PromiseLike<T>) => Promise<T>;

export const untracked: Track = (_label, work) => Promise.resolve(work);

export function createDeadline(ms: number) {
  const pending = new Map<string, Cancellable>();
  let seq = 0;

  const track: Track = (label, work) => {
    const key = pending.has(label) ? `${label}#${++seq}` : label;
    pending.set(key, work as Cancellable);
    return Promise.resolve(work).finally(() => pending.delete(key));
  };

  async function run<T>(work: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const labels = [...pending.keys()];
        for (const item of pending.values()) {
          try {
            item.cancel?.();
          } catch {
            // Best effort: the query may already be settling.
          }
        }
        reject(new DeadlineError(labels, ms));
      }, ms);
    });
    try {
      return await Promise.race([work, expired]);
    } finally {
      clearTimeout(timer);
    }
  }

  return { track, run };
}
