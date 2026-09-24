import postgres from 'postgres';
import { assertPublishedChoiceCoverage } from '../lib/study-choice-catalog';
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false, max: 1 });
  try {
    await sql`SET default_transaction_read_only = on`;
    const count = await assertPublishedChoiceCoverage(sql);
    console.log(`Study choice reserve coverage passed for ${count} published language/word pairs.`);
  } finally { await sql.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Study choice audit failed'); process.exitCode = 1; });
