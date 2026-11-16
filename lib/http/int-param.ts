// Query-string check shared by handlers that take a bounded count
// (`?limit=`, `?new=`, `?days=`).

const WHOLE_NUMBER = /^-?\d+$/;

/**
 * A bounded whole-number query param. Anything that isn't a whole number
 * (missing, empty, "abc", "2.5") gets the fallback; a whole number is clamped
 * to min..max (default 1..100). A bare `Number()` would let NaN through to SQL
 * `LIMIT` and 500 the request.
 */
export function parseIntParam(
  value: string | null,
  fallback: number,
  { min = 1, max = 100 }: { min?: number; max?: number } = {},
): number {
  if (value === null || !WHOLE_NUMBER.test(value)) return fallback;
  return Math.min(max, Math.max(min, Number(value)));
}
