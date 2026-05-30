// DB-aware loader for categories. Server-only because it imports the
// postgres driver via lib/db. Use `categories` from `lib/categories` for
// the client-safe static list — it stays in sync via scripts/migrate.ts.

import "server-only";
import type { Category } from "@/types";
import { categories as staticCategories } from "./categories";
import { localizeCategory } from "./word-localize";
import type { UiLang } from "./settings";
import { getSql } from "./db";

interface CategoryRow {
  id: string;
  name: string;
  name_zh: string;
  emoji: string;
  description: string | null;
  color: string | null;
  image_url: string | null;
  sort_order: number;
  translations: Record<string, string> | string | null;
}

function parseTranslations(v: CategoryRow["translations"]): Record<string, string> {
  if (!v) return {};
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return v;
}

export async function getCategoriesFromDb(lang: UiLang = "zh-Hant"): Promise<Category[]> {
  const sql = getSql();
  if (!sql) return staticCategories.map((c) => localizeCategory(c, lang));
  try {
    const rows = (await sql`
      SELECT c.id, c.name, c.name_zh, c.emoji, c.description, c.color, c.image_url, c.sort_order,
        (SELECT jsonb_object_agg(ct.language, ct.name)
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
        color: r.color ?? "",
        imageUrl: r.image_url ?? "",
      };
      return localizeCategory(base, lang, parseTranslations(r.translations));
    });
  } catch {
    return staticCategories.map((c) => localizeCategory(c, lang));
  }
}
