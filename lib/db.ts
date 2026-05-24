import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let cached: NeonQueryFunction<false, false> | null = null;

// Lazy: construct only when first used and only if DATABASE_URL is present.
// Lets us run `next build` / `npm run dev` without a DB configured.
export function getSql(): NeonQueryFunction<false, false> | null {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  cached = neon(url);
  return cached;
}

export const dbEnabled = () => Boolean(process.env.DATABASE_URL);
