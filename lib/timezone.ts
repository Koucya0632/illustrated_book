// Which calendar "today" is for a request.
//
// The app's days — streak, heatmap, check-in calendar, today's new words, the
// check-in reward — all follow one zone so they never disagree about what
// "today" is. iOS states the phone's zone on every request in
// `X-Tuji-Timezone`; anything without a valid one (web pages, the released
// Android and older iOS builds) keeps the original Asia/Taipei.
//
// A header rather than a stored setting: settings are saved as a whole object,
// so a stored zone would be reset by every client that predates the field.
// The cost is that the zone is client-claimed. That only matters to the
// check-in reward, and its monthly cap (lib/credits/policy.ts) bounds it:
// hopping zones can reach the cap with fewer study days, never past it.

export const DEFAULT_TIMEZONE = "Asia/Taipei";
export const TIMEZONE_HEADER = "x-tuji-timezone";

/** A valid IANA zone name, or the default. */
export function normalizeTimezone(raw: string | null | undefined): string {
  if (!raw || raw.length > 64 || !/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(raw)) return DEFAULT_TIMEZONE;
  try {
    // Throws RangeError for a name the runtime's tz database does not know.
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
    return raw;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function readTimezone(req: Request): string {
  return normalizeTimezone(req.headers.get(TIMEZONE_HEADER));
}

/** Today's date (YYYY-MM-DD) in `tz`. */
export function localDay(now: Date, tz: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now);
}

/** Milliseconds `tz` is ahead of UTC at `instant`. */
function offsetMs(instant: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The instant local midnight starts `day` (YYYY-MM-DD) in `tz`. */
export function startOfDay(day: string, tz: string): Date {
  const wall = Date.parse(`${day}T00:00:00Z`);
  // Two passes settle the offset across a DST change near midnight.
  let guess = wall - offsetMs(wall, tz);
  guess = wall - offsetMs(guess, tz);
  return new Date(guess);
}

/** `day` plus `n` calendar days, as YYYY-MM-DD. */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** The local day and month containing `now`, with the day's UTC bounds. */
export function zonedPeriod(now: Date, tz: string): { day: string; month: string; dayStart: Date; nextDay: Date } {
  const day = localDay(now, tz);
  return { day, month: day.slice(0, 7), dayStart: startOfDay(day, tz), nextDay: startOfDay(addDays(day, 1), tz) };
}
