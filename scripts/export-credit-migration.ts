import { creditMigrationSql } from "../lib/credits/migration-plan";

// Offline export only: no database connection or implicit environment loading.
if (process.argv.length !== 2) {
  console.error("Usage: npx tsx scripts/export-credit-migration.ts");
  process.exitCode = 1;
} else process.stdout.write(creditMigrationSql());

