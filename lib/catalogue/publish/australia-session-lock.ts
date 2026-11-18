/**
 * ISOLATED-TEST ONLY: process-independent Australia batch coordination.
 *
 * PostgreSQL session advisory locks belong to one backend until explicitly
 * unlocked or that session ends. They cannot safely use transaction/statement
 * poolers (PgBouncer feature matrix). A crash releases the session lock but
 * does NOT prove what happened to storage or a transaction. The test-only
 * durable claim therefore binds a batch to its original journal identity.
 *
 * No production connection or migration is exposed here. A production port
 * requires a direct/session-pinned endpoint, permissions review, durable
 * journal access, independently reviewed fencing and recovery, and real
 * target validation. In particular, checking a session does not by itself make
 * an in-flight action atomic with the session surviving through that action.
 *
 * References:
 * https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS
 * https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS
 * https://www.pgbouncer.org/features.html
 */
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;
// Test-only capability binding. Reject caller-fabricated / copied lock handles.
const testLockBindings = new WeakMap<object, Sql>();
type ClaimInput = { journalId: string; planDigest: string; storageFingerprint: string; journalFile: string };
type Claim = ClaimInput & { batchId: string; status: "active" | "completed" };
export class AustraliaLockBusyError extends Error {}
export class AustraliaRecoveryRequiredError extends Error {}
function check(ok: unknown, text: string): asserts ok { if (!ok) throw new Error(text); }
export function assertAustralianTestLockWork(lock: object, candidate: Sql) {
  check(testLockBindings.has(lock) && testLockBindings.get(lock) === candidate, "lock is bound to a different work connection or is not an authentic test lock");
}

/** Stable across process, working directory, journal directory and plan
 * revision. PostgreSQL namespaces advisory locks by database, so the batch ID
 * is intentionally not derived from the connection URL or DB username. */
export function australianBatchLockKey(batchId: string): readonly [number, number] {
  check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(batchId) && batchId.length <= 100, "invalid batch ID");
  const hash = createHash("sha256").update(`tuji:australian-release:session-lock:v1\0${batchId}`).digest();
  return [hash.readInt32BE(0), hash.readInt32BE(4)];
}

/** Strong test-only boundary. Both the dedicated URL and the actual work
 * client's connection options must identify the same local test DB. */
function assertIsolatedDatabase(databaseUrl: string, workSql: Sql) {
  const url = new URL(databaseUrl);
  const hosts = workSql.options.host, ports = workSql.options.port;
  check(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname === "/tuji_au_test" &&
    hosts.length === 1 && hosts[0] === url.hostname && ports.length === 1 && Number(ports[0]) === Number(url.port || 5432) &&
    workSql.options.database === "tuji_au_test" && workSql.options.user === decodeURIComponent(url.username),
  "Australia session lock is restricted to the isolated test database and matching work connection");
  check(workSql.options.max === 1, "Australia test lock requires a single work connection");
}

function validateClaim(input: ClaimInput): ClaimInput {
  check(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.journalId), "invalid journal ID");
  check(/^[a-f0-9]{64}$/.test(input.planDigest), "invalid plan digest");
  check(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(input.storageFingerprint), "invalid storage fingerprint");
  check(path.isAbsolute(input.journalFile), "journal path must be absolute");
  const journalFile = fs.realpathSync(input.journalFile);
  const manifest = JSON.parse(fs.readFileSync(journalFile, "utf8"));
  check(manifest.version === 1 && manifest.journalId === input.journalId && manifest.planDigest === input.planDigest &&
    manifest.target?.storageFingerprint === input.storageFingerprint, "journal contents differ from claim");
  return { ...input, journalFile };
}

/** Create only the throwaway test ledger; never called by the production app. */
export async function installAustraliaTestClaimTable(databaseUrl: string, workSql: Sql) {
  assertIsolatedDatabase(databaseUrl, workSql);
  const [identity] = await workSql`SELECT current_database() AS name, pg_is_in_recovery() AS replica`;
  check(identity.name === "tuji_au_test" && identity.replica === false, "unexpected test database identity");
  await workSql`CREATE TABLE IF NOT EXISTS australia_release_test_claims (
    batch_id TEXT PRIMARY KEY, journal_id UUID NOT NULL, plan_digest TEXT NOT NULL,
    storage_fingerprint TEXT NOT NULL, journal_file TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active','completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
}

/** A separate client of size one is used solely for the lock; do not issue
 * transaction work through it or return it to a pool while it owns a lock. */
export async function acquireAustralianTestBatchLock(databaseUrl: string, workSql: Sql, batchId: string) {
  assertIsolatedDatabase(databaseUrl, workSql);
  const [key1, key2] = australianBatchLockKey(batchId);
  let lost = false, closing = false, released = false;
  const lockSql = postgres(databaseUrl, {
    max: 1, idle_timeout: 0, max_lifetime: null, prepare: false, connect_timeout: 10,
    onclose() { if (!closing) lost = true; },
  });
  let backendPid = 0;
  const sessionChallenge = `au-${randomBytes(24).toString("hex")}`;
  try {
    const [work] = await workSql`SELECT current_database() AS db, current_user AS role,
      inet_server_addr()::text AS server, inet_server_port() AS port, pg_postmaster_start_time()::text AS started,
      pg_backend_pid() AS pid, pg_is_in_recovery() AS replica`;
    const [session] = await lockSql`SELECT current_database() AS db, current_user AS role,
      inet_server_addr()::text AS server, inet_server_port() AS port, pg_postmaster_start_time()::text AS started,
      pg_backend_pid() AS pid, pg_is_in_recovery() AS replica`;
    check(work.db === "tuji_au_test" && work.replica === false && session.replica === false && work.pid !== session.pid &&
      work.db === session.db && work.role === session.role && work.server === session.server && work.port === session.port && work.started === session.started,
    "lock and work connections do not identify the same writable test database on separate sessions");
    backendPid = Number(session.pid);
    const [tagged] = await lockSql`SELECT set_config('application_name',${sessionChallenge},false) AS tag,
      (SELECT backend_start::text FROM pg_stat_activity WHERE pid=pg_backend_pid()) AS backend_started`;
    check(tagged.tag === sessionChallenge && typeof tagged.backend_started === "string", "could not bind test lock session");
    const backendStarted = tagged.backend_started as string;
    const [attempt] = await lockSql`SELECT pg_try_advisory_lock(${key1}::integer,${key2}::integer) AS locked`;
    if (!attempt.locked) throw new AustraliaLockBusyError(`batch ${batchId} is locked by another process`);
    const assertHeld = async () => {
      check(!released && !lost, "advisory-lock session was lost or released");
      const [state] = await lockSql`SELECT pg_backend_pid() AS pid, current_setting('application_name') AS tag, EXISTS (
        SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid() AND granted
          AND classid=(${key1}::bigint & 4294967295)::oid AND objid=(${key2}::bigint & 4294967295)::oid AND objsubid=2
      ) AS held`;
      check(!lost && Number(state.pid) === backendPid && state.tag === sessionChallenge && state.held === true, "advisory-lock session no longer owns the batch lock");
    };
    await assertHeld();
    /** Must execute while holding the session lock. A new journal or changed
     * plan/target for a claimed batch is refused even from another directory. */
    const claimJournal = async (input: ClaimInput): Promise<Claim> => {
      await assertHeld();
      const claim = validateClaim(input);
      await lockSql`INSERT INTO australia_release_test_claims (batch_id,journal_id,plan_digest,storage_fingerprint,journal_file,status)
        VALUES (${batchId},${claim.journalId},${claim.planDigest},${claim.storageFingerprint},${claim.journalFile},'active')
        ON CONFLICT (batch_id) DO NOTHING`;
      const rows = await lockSql`SELECT batch_id,journal_id::text,plan_digest,storage_fingerprint,journal_file,status
        FROM australia_release_test_claims WHERE batch_id=${batchId}`;
      check(rows.length === 1, "batch claim disappeared");
      const row = rows[0];
      if (row.journal_id !== claim.journalId || row.plan_digest !== claim.planDigest || row.storage_fingerprint !== claim.storageFingerprint || row.journal_file !== claim.journalFile) {
        throw new AustraliaRecoveryRequiredError(`batch ${batchId} already belongs to another journal; resume its original claim`);
      }
      await assertHeld();
      return { batchId, ...claim, status: row.status as Claim["status"] };
    };
    /** Recovery inspection must never create or repair a missing claim. */
    const verifyOriginalClaim = async (input: ClaimInput): Promise<Claim> => {
      await assertHeld();
      const claim = validateClaim(input);
      const rows = await lockSql.begin("read only", async (tx) => tx`SELECT journal_id::text,plan_digest,storage_fingerprint,journal_file,status
        FROM australia_release_test_claims WHERE batch_id=${batchId}`);
      const row = rows[0];
      if (rows.length !== 1 || row.journal_id !== claim.journalId || row.plan_digest !== claim.planDigest ||
        row.storage_fingerprint !== claim.storageFingerprint || row.journal_file !== claim.journalFile) {
        throw new AustraliaRecoveryRequiredError(`batch ${batchId} has no matching original claim; recovery refused`);
      }
      await assertHeld();
      return { batchId, ...claim, status: row.status as Claim["status"] };
    };
    const handle = {
      batchId, backendPid, backendStarted, sessionChallenge,
      assertHeld, claimJournal, verifyOriginalClaim,
      /** The caller must independently verify database and media consistency
       * before marking a claim complete; this flag is not proof of publication. */
      async markCompleted(input: ClaimInput) {
        const claim = await claimJournal(input);
        check(claim.status === "active", "batch claim is not active");
        const rows = await lockSql`UPDATE australia_release_test_claims SET status='completed',updated_at=now()
          WHERE batch_id=${batchId} AND journal_id=${claim.journalId} AND plan_digest=${claim.planDigest}
            AND storage_fingerprint=${claim.storageFingerprint} AND journal_file=${claim.journalFile} AND status='active' RETURNING batch_id`;
        check(rows.length === 1, "batch claim completion failed");
        await assertHeld();
      },
      async release() {
        if (released) return;
        released = true;
        try {
          if (!lost) {
            const [row] = await lockSql`SELECT pg_advisory_unlock(${key1}::integer,${key2}::integer) AS unlocked, pg_backend_pid() AS pid`;
            check(Number(row.pid) === backendPid && row.unlocked === true, "session did not own the expected advisory lock at release");
          }
        } finally { closing = true; await lockSql.end({ timeout: 2 }); }
      },
    };
    testLockBindings.set(handle, workSql);
    return Object.freeze(handle);
  } catch (error) { closing = true; await lockSql.end({ timeout: 2 }); throw error; }
}

/** Always release the dedicated session after a callback, including failures.
 * Tests only; it does not itself cancel or fence an in-flight DB transaction. */
export async function withAustralianTestBatchLock<T>(databaseUrl: string, workSql: Sql, batchId: string,
  work: (lock: Awaited<ReturnType<typeof acquireAustralianTestBatchLock>>) => Promise<T>): Promise<T> {
  const lock = await acquireAustralianTestBatchLock(databaseUrl, workSql, batchId);
  try { return await work(lock); } finally { await lock.release(); }
}
