// Month window for /api/users/study-calendar. Pure so it is testable without
// the server-only users-db module.

/** Today's date (YYYY-MM-DD) in `tz`. */
export function localDay(now: Date, tz: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now);
}

/**
 * The month to show: `?month=YYYY-MM`, or the current one when absent.
 * Returns null for a malformed or future month (no studying happens there).
 */
export function calendarMonth(param: string | null, today: string): string | null {
  const current = today.slice(0, 7);
  if (param === null || param === "") return current;
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(param);
  if (!m || Number(m[1]) < 2000) return null;
  return param > current ? null : param;
}

/** First day of `month` and of the month after it, as YYYY-MM-DD. */
export function monthRange(month: string): { start: string; next: string } {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: `${month}-01`, next: `${next}-01` };
}
