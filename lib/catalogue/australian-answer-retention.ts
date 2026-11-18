import reservedIds from "@/data/australian-only-word-ids.json";
import { AUSTRALIAN_RENTAL_CATEGORY, AUSTRALIAN_RENTAL_WORDS } from "@/lib/australian-categories";

// Append-only. Do not derive the installed protection from the current release
// allowlist: removing an ID during withdrawal must never drop its protection.
const retainedIds = [
  "availability", "bills-included", "casual-employee", "condition-report",
  "orientation", "pay-slip", "payment-terminal", "proof-of-enrolment",
  "rental-bond", "roster", "share-house", "shift-handover", "student-portal",
  "student-services-desk", "superannuation", "tax-file-number",
  "tenancy-agreement", "trial-shift", "view-a-room",
] as const;

// These six are deliberately free even while temporarily withdrawn. Keep the
// category on the retained row: old clients send only a card ID, and changing
// the category could turn a valid in-flight answer into a gated 200/no-op.
const housingIds = AUSTRALIAN_RENTAL_WORDS;

function sqlArray(ids: readonly string[]): string {
  if (!ids.length || ids.some((id) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))) {
    throw new Error("invalid Australian retention IDs");
  }
  return `ARRAY[${ids.map((id) => `'${id}'`).join(",")}]::text[]`;
}

function retentionBodies(): { word: string; card: string } {
  if (housingIds.some((id) => !(retainedIds as readonly string[]).includes(id)) ||
      reservedIds.some((id) => !(retainedIds as readonly string[]).includes(id))) {
    throw new Error("Australian reserved and housing IDs must all have retention protection");
  }
  const reserved = sqlArray(retainedIds);
  const housing = sqlArray(housingIds);
  const housingCategory = sqlArray([AUSTRALIAN_RENTAL_CATEGORY]);
  return {
    word: `
      BEGIN
        IF OLD.id = ANY(${reserved}) THEN
          IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'Australian word identity is retained; archive instead of deleting' USING ERRCODE = '23514';
          END IF;
          IF NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'Australian word identity cannot be changed' USING ERRCODE = '23514';
          END IF;
          IF OLD.id = ANY(${housing}) AND OLD.category = ANY(${housingCategory})
             AND NEW.category IS DISTINCT FROM OLD.category THEN
            RAISE EXCEPTION 'Australian housing category is retained for pending answers' USING ERRCODE = '23514';
          END IF;
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END `,
    card: `
      BEGIN
        IF OLD.word_id = ANY(${reserved}) THEN
          IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'Australian card identity is retained; archive the word instead' USING ERRCODE = '23514';
          END IF;
          IF NEW.id IS DISTINCT FROM OLD.id OR NEW.word_id IS DISTINCT FROM OLD.word_id
             OR NEW.deck_key IS DISTINCT FROM OLD.deck_key THEN
            RAISE EXCEPTION 'Australian card identity cannot be changed' USING ERRCODE = '23514';
          END IF;
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END `,
  };
}

/** Install atomically after words and cards exist. Administrative withdrawal
 * must archive the word, leaving the IDs and answer history intact. A hard
 * delete or ID rekey would cascade user data and make old clients drop 404s.
 * This guard does not prevent a privileged operator disabling triggers/TRUNCATE.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function installAustralianAnswerRetention(sql: any): Promise<void> {
  const body = retentionBodies();
  await sql.begin(async (tx: any) => {
    await tx.unsafe(`CREATE OR REPLACE FUNCTION preserve_australian_word_identity() RETURNS trigger LANGUAGE plpgsql AS $$${body.word}$$`);
    await tx.unsafe(`CREATE OR REPLACE FUNCTION preserve_australian_card_identity() RETURNS trigger LANGUAGE plpgsql AS $$${body.card}$$`);
    await tx.unsafe("DROP TRIGGER IF EXISTS australian_word_identity_retention ON words");
    await tx.unsafe("CREATE TRIGGER australian_word_identity_retention BEFORE DELETE OR UPDATE OF id, category ON words FOR EACH ROW EXECUTE FUNCTION preserve_australian_word_identity()");
    await tx.unsafe("DROP TRIGGER IF EXISTS australian_card_identity_retention ON cards");
    await tx.unsafe("CREATE TRIGGER australian_card_identity_retention BEFORE DELETE OR UPDATE OF id, word_id, deck_key ON cards FOR EACH ROW EXECUTE FUNCTION preserve_australian_card_identity()");
  });
}

/** Inspect the actual target schema. Call within a read-only transaction. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function verifyAustralianAnswerRetention(sql: any, schema = "public"): Promise<string[]> {
  const expected = retentionBodies();
  const rows = await sql`
    SELECT t.tgname, t.tgenabled, t.tgtype::int AS trigger_type,
           t.tgqual IS NULL AS unconditional, t.tgoldtable IS NULL AND t.tgnewtable IS NULL AS no_transition_tables,
           c.relname AS table_name, n.nspname AS table_schema,
           p.proname AS function_name, pn.nspname AS function_schema,
           p.prosrc AS function_body, p.prosecdef AS security_definer,
           l.lanname AS function_language,
           ARRAY(SELECT a.attname FROM unnest(t.tgattr::smallint[]) att(num)
                 JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = att.num
                 ORDER BY a.attname) AS update_columns
      FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
      JOIN pg_catalog.pg_namespace pn ON pn.oid = p.pronamespace
      JOIN pg_catalog.pg_language l ON l.oid = p.prolang
     WHERE n.nspname = ${schema} AND c.relname IN ('words', 'cards') AND NOT t.tgisinternal
       AND t.tgname IN ('australian_word_identity_retention', 'australian_card_identity_retention')
  `;
  const required = [
    { trigger: "australian_word_identity_retention", table: "words", fn: "preserve_australian_word_identity", body: expected.word, columns: ["category", "id"] },
    { trigger: "australian_card_identity_retention", table: "cards", fn: "preserve_australian_card_identity", body: expected.card, columns: ["deck_key", "id", "word_id"] },
  ];
  const problems: string[] = [];
  for (const item of required) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matches = rows.filter((row: any) => row.tgname === item.trigger && row.table_name === item.table);
    if (matches.length !== 1) { problems.push(`${item.trigger}: missing or duplicated`); continue; }
    const row = matches[0];
    if (!["O", "A"].includes(row.tgenabled) || row.trigger_type !== 27 || !row.unconditional || !row.no_transition_tables ||
        row.table_schema !== schema || row.function_schema !== schema || row.function_name !== item.fn ||
        row.function_language !== "plpgsql" || row.security_definer || row.function_body !== item.body ||
        JSON.stringify(row.update_columns) !== JSON.stringify(item.columns)) {
      problems.push(`${item.trigger}: disabled or definition differs`);
    }
  }
  return problems;
}
