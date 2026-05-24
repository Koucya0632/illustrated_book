// Postgres connection for direct SQL — Supabase exposes a standard Postgres
// endpoint via the connection pooler. We use `postgres` (porsager/postgres)
// because it works in Node runtime without long-lived connections that don't
// suit serverless functions.

import postgres from "postgres";

let cached: ReturnType<typeof postgres> | null = null;

export function getSql(): ReturnType<typeof postgres> | null {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  cached = postgres(url, {
    // Pooler is shared, so we keep connections lean.
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    // Supabase requires SSL.
    ssl: "require",
    // Disable prepared statements — Supabase transaction-mode pooler doesn't
    // support them across requests.
    prepare: false,
    // Auto-parse JSONB (PG type 3802) and JSON (PG type 114). Without this,
    // postgres-js returns them as raw strings and `.map`/`.length` blow up
    // in places that expect already-parsed arrays/objects.
    types: {
      json: {
        to: 114,
        from: [114, 3802],
        serialize: JSON.stringify,
        parse: JSON.parse,
      },
    },
  });
  return cached;
}

export const dbEnabled = () => Boolean(process.env.DATABASE_URL);
