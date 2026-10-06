import { CREDIT_DDL } from "./schema";
import { AI_OPERATION_DDL } from "../ai-operations/schema";
import { CREDIT_POLICY } from "./policy";

/** Offline export. Schema and RLS share one commit; no feature flags or account changes. */
export function creditMigrationSql(): string {
  return [
    `-- Tuji credit schema: ${CREDIT_POLICY.version}`,
    "-- Generated from application DDL; does not enroll accounts or enable purchases.",
    "BEGIN;",
    "SET LOCAL lock_timeout = '5s';",
    "SET LOCAL statement_timeout = '60s';",
    ...[...CREDIT_DDL, ...AI_OPERATION_DDL].map(statement => statement + ";"),
    "COMMIT;",
    "",
  ].join("\n\n");
}

