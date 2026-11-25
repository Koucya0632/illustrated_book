// Fixture for tests/transaction-audit.test.ts. Never imported at runtime.
// Each function marked BAD must be reported; each marked OK must not.
import type postgres from "postgres";
import { getSql } from "../../../lib/db";

type Pool = postgres.Sql;
type Tx = postgres.TransactionSql;

async function countViaPool() {
  return getSql()!`SELECT count(*) FROM t`;
}
async function countIn(tx: Tx) {
  return tx`SELECT count(*) FROM t`;
}
function makeWallet(sql: Pool) {
  return { transact: <T>(run: (scope: { sql: Tx }) => Promise<T>) => sql.begin((tx) => run({ sql: tx as unknown as Tx })) };
}

// BAD: the pool itself inside its own transaction.
export async function outerHandle(sql: Pool) {
  await sql.begin(async (tx) => {
    await tx`SELECT 1`;
    await sql`SELECT 2`;
  });
}

// BAD: a helper that reaches getSql().
export async function helperReachesPool(sql: Pool) {
  await sql.begin(async (tx) => {
    await tx`SELECT 1`;
    await countViaPool();
  });
}

// BAD: a store's own pool used inside wallet.transact (dependency injection).
export function store(sql: Pool) {
  const wallet = makeWallet(sql);
  return {
    async complete() {
      return wallet.transact(async (scope) => {
        await scope.sql`SELECT 1`;
        await sql`UPDATE t SET done = true`;
      });
    },
  };
}

// OK: everything goes through the transaction.
export async function usesTx(sql: Pool) {
  await sql.begin(async (tx) => {
    await tx`SELECT 1`;
    await countIn(tx);
    await tx.savepoint(async (sp) => { await sp`SELECT 2`; });
  });
}

// OK: wallet.transact through scope.sql.
export function goodStore(sql: Pool) {
  const wallet = makeWallet(sql);
  return { complete: () => wallet.transact(async (scope) => { await scope.sql`SELECT 1`; }) };
}
