import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { auditTransactions } from "../scripts/audit-transactions";

const root = path.resolve(__dirname, "..");

test("no transaction in lib/ or app/ queries through the shared pool", () => {
  assert.deepEqual(auditTransactions({ root }), []);
});

test("the audit reports each way a transaction can reach the pool, and nothing else", () => {
  const fixture = path.join(root, "tests/fixtures/transaction-audit/cases.ts");
  const findings = auditTransactions({ root, files: [fixture] });
  const lines = findings.map((f) => f.replace(/^.*cases\.ts:(\d+): (.*?) inside.*$/, "$1 $2"));
  assert.deepEqual(lines, [
    "23 pool handle `sql` used",
    "31 countViaPool() reaches getSql()",
    "42 pool handle `sql` used",
  ]);
});
