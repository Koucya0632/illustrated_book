import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { australianRentalBatchReady, australianRentalGate } from "../lib/catalogue/australian-rental-gate";
import { AUSTRALIAN_RENTAL_CATEGORY, AUSTRALIAN_RENTAL_WORDS } from "../lib/australian-categories";
const url=process.env.AU_TEST_DATABASE_URL;
test("rental SQL gate opens only for the complete published category in the same snapshot",{skip:!url},async()=>{
 const u=new URL(url!);assert.ok(["127.0.0.1","localhost","[::1]"].includes(u.hostname));assert.equal(u.pathname,"/tuji_au_test");
 const sql=postgres(url!,{max:1});
 try {
  await sql`CREATE TEMP TABLE words (id text PRIMARY KEY, category text, status text, deleted_at timestamptz)`;
  await sql`INSERT INTO words VALUES ('mug','kitchen','published',null)`;
  const query=async()=>sql`SELECT id FROM words w WHERE ${australianRentalGate(sql,sql`w.id`)} ORDER BY id`;
  for(const id of AUSTRALIAN_RENTAL_WORDS.slice(0,5)) await sql`INSERT INTO words VALUES (${id},${AUSTRALIAN_RENTAL_CATEGORY},'published',null)`;
  assert.deepEqual((await query()).map(x=>x.id),['mug']);assert.equal(await australianRentalBatchReady(sql),false);
  const last=AUSTRALIAN_RENTAL_WORDS[5];await sql`INSERT INTO words VALUES (${last},${AUSTRALIAN_RENTAL_CATEGORY},'published',null)`;
  assert.equal((await query()).length,7);assert.equal(await australianRentalBatchReady(sql),true);
  await sql`UPDATE words SET category='living-room' WHERE id=${last}`;assert.deepEqual((await query()).map(x=>x.id),['mug']);assert.equal(await australianRentalBatchReady(sql),false);
  await sql`UPDATE words SET category=${AUSTRALIAN_RENTAL_CATEGORY},deleted_at=now() WHERE id=${last}`;assert.deepEqual((await query()).map(x=>x.id),['mug']);
  await sql`UPDATE words SET deleted_at=null,status='draft' WHERE id=${last}`;assert.deepEqual((await query()).map(x=>x.id),['mug']);
 } finally { await sql.end(); }
});
