import type { CategoryTranslation } from "../word-localize";
import { TOPIC_GATE_PLAN } from "./releases";
import { AUSTRALIAN_RENTAL_CATEGORY, AUSTRALIAN_RENTAL_WORDS } from "../australian-categories";

export interface CatalogueTopicRow {
  id: string;
  name: string;
  name_zh: string;
  emoji: string;
  description: string | null;
  description_en: string | null;
  color: string | null;
  image_url: string | null;
  sort_order: number;
  /** language -> localized name and description (ja today). The description is
   *  nullable per row, so a language can have a translated name and still fall
   *  back to the zh-Hant description. */
  translations: Record<string, CategoryTranslation> | null;
}

/** The live topic list. A topic a guarded release opens stays hidden until
 * every word its releases plan is published in it (lib/catalogue/releases.ts);
 * the routine migration guard is the other half of the same rule. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readCatalogueTopics(sql: any): Promise<CatalogueTopicRow[]> {
  const categoryGate = [...TOPIC_GATE_PLAN.categories, ...AUSTRALIAN_RENTAL_WORDS.map(() => AUSTRALIAN_RENTAL_CATEGORY)];
  const wordGate = [...TOPIC_GATE_PLAN.ids, ...AUSTRALIAN_RENTAL_WORDS];
  return (await sql`
    SELECT c.id, c.name, c.name_zh, c.emoji, c.description, c.description_en,
           c.color, c.image_url, c.sort_order,
      (SELECT jsonb_object_agg(
                ct.language,
                jsonb_build_object('name', ct.name, 'description', ct.description))
         FROM category_translations ct WHERE ct.category_id = c.id) AS translations
    FROM categories c
    WHERE NOT EXISTS (
      SELECT 1
      FROM unnest(${categoryGate}::text[], ${wordGate}::text[])
        AS planned(category, id)
      WHERE planned.category = c.id
        AND NOT EXISTS (
          SELECT 1 FROM words w
          WHERE w.id = planned.id
            AND w.category = planned.category
            AND w.status = 'published'
            AND w.deleted_at IS NULL
        )
    )
    ORDER BY c.sort_order, c.id
  `) as CatalogueTopicRow[];
}
