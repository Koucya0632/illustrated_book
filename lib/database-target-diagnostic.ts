import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

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

/** Dedicated activation key; never use the admin password or cookie key. */
export function mintDiagnosticActivation(keyHex: string, ref: string, digest: string, now: number, lifetimeMs = 60_000): string {
  if (!/^[a-f0-9]{64}$/.test(keyHex) || !/^[a-z0-9]{16,32}$/.test(ref) || !/^[a-f0-9]{64}$/.test(digest) || !Number.isSafeInteger(now) || !Number.isSafeInteger(lifetimeMs) || lifetimeMs < 1 || lifetimeMs > 300_000) throw new Error('invalid activation parameters');
  const payload = `v2.${now}.${now + lifetimeMs}.${randomBytes(16).toString('hex')}.${ref}.${digest}`;
  return `${payload}.${createHmac('sha256', Buffer.from(keyHex, 'hex')).update(payload).digest('hex')}`;
}

export function validDiagnosticActivation(token: string | undefined, keyHex: string | undefined, keyFrom: string | undefined, keyExpires: string | undefined, expectedRef: string, expectedDigest: string, now: number): boolean {
  if (!token || token.length > 256 || !keyHex || !/^[a-f0-9]{64}$/.test(keyHex) || !keyFrom || !/^\d{13}$/.test(keyFrom) || !keyExpires || !/^\d{13}$/.test(keyExpires) || !Number.isSafeInteger(now)) return false;
  const match = /^v2\.(\d{13})\.(\d{13})\.([a-f0-9]{32})\.([a-z0-9]{16,32})\.([a-f0-9]{64})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return false;
  const issued = Number(match[1]), expires = Number(match[2]), keyStart = Number(keyFrom), keyDeadline = Number(keyExpires);
  if (keyDeadline <= keyStart || keyDeadline - keyStart > 24 * 60 * 60_000 || issued < keyStart || issued > now || now < keyStart || expires <= now || expires <= issued || expires - issued > 300_000 || expires > keyDeadline || now >= keyDeadline || match[4] !== expectedRef || match[5] !== expectedDigest) return false;
  const payload = `v2.${match[1]}.${match[2]}.${match[3]}.${match[4]}.${match[5]}`;
  const expected = createHmac('sha256', Buffer.from(keyHex, 'hex')).update(payload).digest();
  return timingSafeEqual(expected, Buffer.from(match[6], 'hex'));
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
  now: () => number; production: boolean; activation: string | undefined; key: string | undefined; keyFrom: string | undefined; keyExpires: string | undefined;
  ref: string | undefined; expectedDigest: string | undefined;
  authorized: () => Promise<boolean>; sql: () => TargetDiagnosticSql | null;
}) {
  if (!deps.production || !deps.ref || !/^[a-z0-9]{16,32}$/.test(deps.ref) || !deps.expectedDigest || !/^[a-f0-9]{64}$/.test(deps.expectedDigest)) return null;
  try { if (!await deps.authorized()) return null; } catch { return null; }
  const activated = () => validDiagnosticActivation(deps.activation, deps.key, deps.keyFrom, deps.keyExpires, deps.ref!, deps.expectedDigest!, deps.now());
  if (!activated()) return null;
  try {
    const sql = deps.sql();
    const result = sql ? await inspectDatabaseTarget(sql, deps.ref, deps.expectedDigest) : { configuredRefMatches: null, databaseIdentityMatches: null };
    return activated() ? result : null;
  } catch { return activated() ? { configuredRefMatches: null, databaseIdentityMatches: null } : null; }
}
