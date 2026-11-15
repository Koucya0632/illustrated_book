// Every 檢舉 reason, once. The DB CHECK (lib/atlas/spot-schema.ts), the three
// report routes, the admin queue's labels and the website's report button all
// read this list; adding a reason is one entry here.
//
// Order matters for one reader only: the CHECK's guard looks for the LAST
// value, so a new reason goes at the end.

/** What a report points at, as stored in `atlas_reports.target_type`. */
export const REPORT_TARGETS = ["item", "collection", "author", "item_spot"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export interface ReportReasonSpec {
  value: string;
  /** zh-Hant, for the admin queue and the website's report form. */
  label: string;
  /** Where a reporter may pick it. `item_spot` = a card shared to a 景點. */
  offeredFor: readonly ("item" | "collection" | "author" | "item_spot")[];
  /** Escalates on the first report. */
  highRisk: boolean;
  /** Counts toward pulling the thing off 物見 (`ATLAS_REPORT_ESCALATE_AT`). */
  countsTowardTakedown: boolean;
}

export const REPORT_REASONS = [
  // The website's form lists them in this order, most serious first.
  { value: "inappropriate", label: "不當內容", offeredFor: ["item", "collection", "author"], highRisk: true, countsTowardTakedown: true },
  { value: "copyright", label: "侵權", offeredFor: ["item", "collection", "author"], highRisk: true, countsTowardTakedown: true },
  { value: "wrong", label: "資訊錯誤", offeredFor: ["item", "collection", "author"], highRisk: false, countsTowardTakedown: true },
  { value: "spam", label: "垃圾／廣告", offeredFor: ["item", "collection", "author"], highRisk: false, countsTowardTakedown: true },
  { value: "other", label: "其他", offeredFor: ["item", "collection", "author"], highRisk: false, countsTowardTakedown: true },
  // 「不是在這裡拍的」 is about where a card sits, not whether it may be public:
  // filed against the card AT its spot, and an admin removes it from the spot.
  { value: "not_here", label: "不是在這裡拍的", offeredFor: ["item_spot"], highRisk: false, countsTowardTakedown: false },
] as const satisfies readonly ReportReasonSpec[];

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export const REPORT_REASON_VALUES: readonly ReportReason[] = REPORT_REASONS.map((r) => r.value);

export function reportReason(value: string): ReportReasonSpec | null {
  return REPORT_REASONS.find((r) => r.value === value) ?? null;
}

/** The reasons a reporter may pick for this kind of thing. */
export function reasonsFor(target: "item" | "collection" | "author" | "item_spot"): ReportReasonSpec[] {
  return REPORT_REASONS.filter((r) => (r.offeredFor as readonly string[]).includes(target));
}

export const REPORT_REASON_LABELS: Record<string, string> = Object.fromEntries(
  REPORT_REASONS.map((r) => [r.value, r.label]),
);

/** SQL list of the reasons that count toward a takedown, for `reason IN (...)`. */
export const TAKEDOWN_REASON_VALUES: readonly string[] = REPORT_REASONS.filter((r) => r.countsTowardTakedown).map(
  (r) => r.value,
);
