// DB-aware loader for categories. Server-only because it imports the
// postgres driver via lib/db. Use `categories` from `lib/categories` for
// the client-safe static list — it stays in sync via scripts/migrate.ts.

import "server-only";
import type { Category } from "@/types";
import { categories as staticCategories } from "./categories";
import { localizeCategory, type CategoryTranslation } from "./word-localize";
import type { UiLang } from "./settings";
import { getSql } from "./db";

interface CategoryRow {
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

export async function getCategoriesFromDb(lang: UiLang = "zh-Hant"): Promise<Category[]> {
  const sql = getSql();
  if (!sql) return staticCategories.map((c) => localizeCategory(c, lang));
  try {
    const rows = (await sql`
      SELECT c.id, c.name, c.name_zh, c.emoji, c.description, c.description_en,
             c.color, c.image_url, c.sort_order,
        (SELECT jsonb_object_agg(
                  ct.language,
                  jsonb_build_object('name', ct.name, 'description', ct.description))
           FROM category_translations ct WHERE ct.category_id = c.id) AS translations
      FROM categories c
      ORDER BY c.sort_order, c.id
    `) as unknown as CategoryRow[];
    if (rows.length === 0) return staticCategories.map((c) => localizeCategory(c, lang));
    return rows.map((r) => {
      const base: Category = {
        id: r.id,
        name: r.name,
        nameZh: r.name_zh,
        emoji: r.emoji,
        description: r.description ?? "",
        descriptionEn: r.description_en ?? undefined,
        color: r.color ?? "",
        imageUrl: r.image_url ?? "",
      };
      return localizeCategory(base, lang, r.translations ?? undefined);
    });
  } catch {
    return staticCategories.map((c) => localizeCategory(c, lang));
  }
}
