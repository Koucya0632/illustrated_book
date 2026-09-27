// Enable RLS on every public table that lacks it.
//
// Supabase exposes the public schema over its REST API with the app's public
// (anon) key, and anon/authenticated hold full table privileges by default. A
// table without RLS is therefore readable AND writable by anyone. In 2026-09 23
// tables were in that state, including user_entitlement_grants (self-grant Pro)
// and every study_logs partition (partitions don't inherit the parent's RLS
// when queried directly).
//
// RLS with no policy denies anon/authenticated entirely. The server connects as
// the owning role, which bypasses RLS, and no client reads tables directly — so
// this changes nothing for the product. Tables that need client access get
// explicit policies elsewhere (see the *_own policies in scripts/migrate.ts).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlExecutor = any;

export function rlsLockdownStatement(table: string): string {
  return `ALTER TABLE public."${table.replace(/"/g, '""')}" ENABLE ROW LEVEL SECURITY`;
}

/** Returns the tables it had to lock down (empty when everything was already protected). */
export async function lockDownPublicTables(sql: SqlExecutor): Promise<string[]> {
  const rows = (await sql`
    SELECT c.relname AS name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
       AND NOT c.relrowsecurity
     ORDER BY c.relname
  `) as { name: string }[];
  for (const { name } of rows) {
    await sql.unsafe(rlsLockdownStatement(name));
  }
  return rows.map((r) => r.name);
}
