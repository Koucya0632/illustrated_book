/** Read-only deployment gate. The operator supplies the intended host and DB
 * separately from the connection URL to catch accidental testing elsewhere. */
import postgres from "postgres";
import { verifyAustralianAnswerRetention } from "../lib/catalogue/australian-answer-retention";

class GuardCheckError extends Error {}

async function main() {
  const url = process.env.AU_RETENTION_VERIFY_DATABASE_URL;
  const expectedHost = process.env.AU_RETENTION_EXPECTED_HOST;
  const expectedDatabase = process.env.AU_RETENTION_EXPECTED_DATABASE;
  if (!url || !expectedHost || !expectedDatabase) throw new GuardCheckError("missing target verification configuration");
  const parsed = new URL(url);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || parsed.hostname !== expectedHost ||
      decodeURIComponent(parsed.pathname.slice(1)) !== expectedDatabase) {
    throw new GuardCheckError("connection target does not match the explicitly expected host and database");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  const sql = postgres(url, { max: 1, ssl: local ? false : "require", connect_timeout: 10 });
  try {
    const problems = await sql.begin(async (tx) => {
      await tx`SET TRANSACTION READ ONLY`;
      const [identity] = await tx`SELECT current_database() AS database, pg_is_in_recovery() AS replica,
        current_setting('session_replication_role') AS replication_role`;
      if (identity.database !== expectedDatabase || identity.replica !== false || identity.replication_role !== "origin") {
        return ["connected database differs, is a read replica, or does not use normal trigger execution"];
      }
      return verifyAustralianAnswerRetention(tx);
    });
    if (problems.length) throw new GuardCheckError(problems.join("; "));
    console.log("Australian answer retention: verified on the specified primary database");
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  // Connection errors may contain credentials or server details; do not echo.
  const detail = error instanceof GuardCheckError ? error.message : "connection or query failed; check target configuration";
  console.error(`Australian answer retention verification failed: ${detail}`);
  process.exitCode = 1;
});
