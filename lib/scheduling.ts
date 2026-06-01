// Adaptive new-card cap. Curates how many *new* words the user is offered
// per session as a function of their review backlog (`stats.due`):
//
//   backlog ≤ 20         → full base (current ~10 / session)
//   backlog 21 .. 50     → halve
//   backlog 51 .. 100    → quarter
//   backlog 100+         → pause (0 — caller may override with confirmation)
//
// Goal: stop the SRS forgetting curve from snowballing. If yesterday's words
// are stacking up, push the user to clear those first instead of flooding
// the queue with more new material. The 100+ band returns 0 but the UI is
// expected to surface a non-blocking warning + an override path so users
// who consciously want to keep adding new words can.
//
// Pure function — safe to import on both server and client.

export interface BacklogBand {
  readonly max: number;
  readonly factor: number;
  readonly label: "normal" | "halved" | "quartered" | "paused";
}

export const BACKLOG_THRESHOLDS: readonly BacklogBand[] = [
  { max: 20, factor: 1.0, label: "normal" },
  { max: 50, factor: 0.5, label: "halved" },
  { max: 100, factor: 0.25, label: "quartered" },
  { max: Number.POSITIVE_INFINITY, factor: 0, label: "paused" },
];

export interface NewLimitResult {
  /** How many new cards to offer this session. */
  limit: number;
  /** Which band the backlog falls in — drives the warning UI. */
  band: BacklogBand["label"];
}

/**
 * Compute the per-session new-card limit from a `base` (e.g. the user's
 * configured daily new-card baseline) and current review `backlog`.
 *
 *   computeNewLimit(10, 0)   → { limit: 10, band: "normal" }
 *   computeNewLimit(10, 30)  → { limit:  5, band: "halved" }
 *   computeNewLimit(10, 80)  → { limit:  3, band: "quartered" }
 *   computeNewLimit(10, 150) → { limit:  0, band: "paused" }
 */
export function computeNewLimit(base: number, backlog: number): NewLimitResult {
  const safeBase = Math.max(0, Math.floor(base));
  const safeBacklog = Math.max(0, Math.floor(backlog));
  const band =
    BACKLOG_THRESHOLDS.find((b) => safeBacklog <= b.max) ??
    BACKLOG_THRESHOLDS[BACKLOG_THRESHOLDS.length - 1];
  return { limit: Math.ceil(safeBase * band.factor), band: band.label };
}
