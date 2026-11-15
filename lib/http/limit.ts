// Query-string check shared by list handlers that take a `?limit=`.

const WHOLE_NUMBER = /^-?\d+$/;

/**
 * The page size from `?limit=`. Anything that isn't a whole number (missing,
 * empty, "abc", "2.5") gets the fallback; a whole number is clamped to 1..100.
 * A bare `Number()` would let NaN through to SQL `LIMIT` and 500 the request.
 */
export function parseLimit(value: string | null, fallback: number): number {
  if (value === null || !WHOLE_NUMBER.test(value)) return fallback;
  return Math.min(100, Math.max(1, Number(value)));
}
