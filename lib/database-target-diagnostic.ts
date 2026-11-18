import { createHash, timingSafeEqual } from 'node:crypto';

// An operational diagnostic, not an authorization or a proof of fleet-wide
// identity. No connection details, SQL errors or fingerprints leave this module.
export type TargetDiagnosticSql = {
  options: { host: string[]; user: string };
  begin<T>(mode: string, callback: (tx: TargetDiagnosticTx) => Promise<T>): Promise<T>;
};
export type TargetDiagnosticTx = (parts: TemplateStringsArray, ...args: unknown[]) => Promise<Array<{ system_id?: string; database_name?: string }>>;

export function configuredProjectMatches(hosts: string[], user: string, ref: string): boolean | null {
  if (!/^[a-z0-9]{16,32}$/.test(ref) || !Array.isArray(hosts) || hosts.length !== 1 || typeof user !== 'string') return null;
  const host = hosts[0].toLowerCase();
  const direct = /^db\.([a-z0-9]{16,32})\.supabase\.co$/.exec(host);
  if (direct) return direct[1] === ref;
  if (!/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)) return null;
  const tenant = /^[a-zA-Z_][a-zA-Z0-9_-]*\.([a-z0-9]{16,32})$/.exec(user);
  return tenant ? tenant[1] === ref : null;
}

// Compute this value separately over the candidate's own authenticated,
// read-only connection. A matching system identifier and database name are
// evidence of a matching PostgreSQL cluster/database, not proof of deployment
// identity or that all provider instances and replicas match.
export function databaseIdentityDigest(systemId: string, databaseName: string): string {
  return createHash('sha256').update(JSON.stringify([systemId, databaseName])).digest('hex');
}

export async function inspectDatabaseTarget(sql: TargetDiagnosticSql, ref: string, expectedDigest: string) {
  const configuredRefMatches = configuredProjectMatches(sql.options.host, sql.options.user, ref);
  let databaseIdentityMatches: boolean | null = null;
  if (/^[a-f0-9]{64}$/.test(expectedDigest)) {
    try {
      const rows = await sql.begin('read only', async tx => {
        await tx`set local statement_timeout = '3s'`;
        return tx`select system_identifier::text as system_id, current_database()::text as database_name from pg_catalog.pg_control_system()`;
      });
      const row = rows[0];
      if (rows.length === 1 && typeof row.system_id === 'string' && /^\d+$/.test(row.system_id) && typeof row.database_name === 'string' && row.database_name.length > 0) {
        databaseIdentityMatches = timingSafeEqual(Buffer.from(databaseIdentityDigest(row.system_id, row.database_name), 'hex'), Buffer.from(expectedDigest, 'hex'));
      }
    } catch { /* unavailable, denied or timed out: never return error details */ }
  }
  return { configuredRefMatches, databaseIdentityMatches };
}

export async function runTargetDiagnostic(deps: {
  now: () => number; production: boolean; from: string | undefined; until: string | undefined;
  ref: string | undefined; expectedDigest: string | undefined;
  authorized: () => Promise<boolean>; sql: () => TargetDiagnosticSql | null;
}) {
  const from = deps.from && /^\d{13}$/.test(deps.from) ? Number(deps.from) : NaN;
  const until = deps.until && /^\d{13}$/.test(deps.until) ? Number(deps.until) : NaN;
  const now = deps.now();
  if (!deps.production || !Number.isFinite(from) || !Number.isFinite(until) || until <= from || until - from > 5 * 60_000 || now < from || now >= until ||
      !deps.ref || !/^[a-z0-9]{16,32}$/.test(deps.ref) || !deps.expectedDigest || !/^[a-f0-9]{64}$/.test(deps.expectedDigest)) return null;
  try { if (!await deps.authorized()) return null; } catch { return null; }
  if (deps.now() >= until) return null;
  try {
    const sql = deps.sql();
    const result = sql ? await inspectDatabaseTarget(sql, deps.ref, deps.expectedDigest) : { configuredRefMatches: null, databaseIdentityMatches: null };
    return deps.now() < until ? result : null;
  } catch { return deps.now() < until ? { configuredRefMatches: null, databaseIdentityMatches: null } : null; }
}
