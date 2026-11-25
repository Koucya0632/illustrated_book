import assert from "node:assert/strict";
import test from "node:test";
import { watchTransactions } from "../lib/db-watch";

function fakeSql() {
  const queries: string[] = [];
  const tx = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => { queries.push(strings.join("$")); return Promise.resolve(values); },
    { unsafe: (text: string) => { queries.push(text); return Promise.resolve([]); } },
  );
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const sql = {
    hold: false,
    async begin(...args: unknown[]) {
      if (sql.hold) await gate;
      const fn = args.find((a) => typeof a === "function") as (t: typeof tx) => Promise<unknown>;
      return fn(tx);
    },
  };
  return { sql, tx, queries, release: () => release() };
}

test("labels a transaction by its first SQL template and keeps results and queries intact", async () => {
  const { sql, queries } = fakeSql();
  let now = 0;
  const logs: Array<[string, Record<string, unknown>]> = [];
  const watch = watchTransactions(sql as never, (m, d) => logs.push([m, d]), () => now);
  const result = await (sql.begin as (o: string, f: (tx: any) => Promise<unknown>) => Promise<unknown>)("read only", async (tx) => {
    const first = await tx`SELECT pg_advisory_xact_lock(${1})`;
    await tx`UPDATE wallets SET balance = ${2}`;
    now = 6_000;
    return first;
  });
  assert.deepEqual(result, [1]);
  assert.deepEqual(queries, ["SELECT pg_advisory_xact_lock($)", "UPDATE wallets SET balance = $"]);
  assert.equal(watch.open.size, 0);
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], "[db] slow transaction");
  assert.equal(logs[0][1].label, "SELECT pg_advisory_xact_lock($)");
  assert.equal(logs[0][1].totalMs, 6_000);
});

test("labels unsafe() queries and reports waiting vs holding transactions", async () => {
  const { sql, release } = fakeSql();
  let now = 0;
  const logs: Array<[string, Record<string, unknown>]> = [];
  const watch = watchTransactions(sql as never, (m, d) => logs.push([m, d]), () => now);
  let finish: () => void = () => {};
  const holding = (sql.begin as (f: (tx: any) => Promise<unknown>) => Promise<unknown>)(async (tx) => {
    await tx.unsafe("CREATE TABLE IF NOT EXISTS x (id int)");
    await new Promise<void>((resolve) => { finish = resolve; });
  });
  await Promise.resolve();
  sql.hold = true;
  const waiting = (sql.begin as (f: (tx: any) => Promise<unknown>) => Promise<unknown>)(async () => {});
  now = 11_000;
  watch.check();
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], "[db] long-open transactions");
  assert.equal(logs[0][1].waiting, 1);
  assert.equal(logs[0][1].holding, 1);
  watch.check();
  assert.equal(logs.length, 1, "each threshold logs once");
  finish(); release();
  await Promise.all([holding, waiting]);
  assert.equal(watch.open.size, 0);
});

test("a failing transaction still leaves the registry and rethrows", async () => {
  const { sql } = fakeSql();
  const watch = watchTransactions(sql as never, () => {}, () => 0);
  await assert.rejects((sql.begin as (f: () => Promise<unknown>) => Promise<unknown>)(async () => { throw new Error("boom"); }), /boom/);
  assert.equal(watch.open.size, 0);
});
