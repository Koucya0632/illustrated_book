import { AUSTRALIAN_RENTAL_CATEGORY, AUSTRALIAN_RENTAL_WORDS } from "../australian-categories";

/** SQL predicate, evaluated inside the caller's statement snapshot. It hides
 * each reserved rental word until every one is published in its intended
 * category. `wordId` must be a trusted SQL fragment, never raw request text. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function australianRentalGate(sql: any, wordId: any) {
  return sql`(
    NOT (${wordId} = ANY(${AUSTRALIAN_RENTAL_WORDS}::text[]))
    OR NOT EXISTS (
      SELECT 1 FROM unnest(${AUSTRALIAN_RENTAL_WORDS}::text[]) AS expected(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM words rental
        WHERE rental.id = expected.id AND rental.category = ${AUSTRALIAN_RENTAL_CATEGORY}
          AND rental.status = 'published' AND rental.deleted_at IS NULL
      )
    )
  )`;
}

/** Fresh uncached state check used after combining independently cached shards. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function australianRentalBatchReady(sql: any): Promise<boolean> {
  const [row] = await sql`SELECT NOT EXISTS (
    SELECT 1 FROM unnest(${AUSTRALIAN_RENTAL_WORDS}::text[]) AS expected(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM words rental WHERE rental.id = expected.id
        AND rental.category = ${AUSTRALIAN_RENTAL_CATEGORY}
        AND rental.status = 'published' AND rental.deleted_at IS NULL
    )
  ) AS ready`;
  return row?.ready === true;
}
