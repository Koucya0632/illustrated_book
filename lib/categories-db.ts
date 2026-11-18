// DB-aware loader for categories. Server-only because it imports the
// postgres driver via lib/db. The static list in `lib/categories` is the
// no-database fallback; scripts/migrate.ts syncs it into the table.

import "server-only";
import type { Category } from "@/types";
import { publicFallbackCategories as staticCategories } from "./categories";
import { localizeCategory } from "./word-localize";
import type { LearningDirection, UiLang } from "./settings";
import variants from "@/data/australian-word-variants.json";
import { regionalCatalogueActive, type AustralianWordVariants } from "./australian-word-variants";
import { filterAustralianCategories } from "./australian-categories";
import { getSql } from "./db";
import { readCatalogueTopics } from "./catalogue/topics";

export async function getCategoriesFromDb(lang: UiLang = "zh-Hant", direction?: LearningDirection): Promise<Category[]> {
  const scoped = (categories: Category[]) => filterAustralianCategories(categories, direction, variants as AustralianWordVariants);
  const sql = getSql();
  if (!sql) {
    if (regionalCatalogueActive && direction === "zh-en") throw new Error("regional categories require database");
    return scoped(staticCategories.map((c) => localizeCategory(c, lang)));
  }
  try {
    const rows = await readCatalogueTopics(sql);
    if (rows.length === 0) {
      if (regionalCatalogueActive && direction === "zh-en") throw new Error("regional categories unavailable");
      return scoped(staticCategories.map((c) => localizeCategory(c, lang)));
    }
    return scoped(rows.map((r) => {
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
    }));
  } catch (error) {
    if (regionalCatalogueActive && direction === "zh-en") throw error;
    return scoped(staticCategories.map((c) => localizeCategory(c, lang)));
  }
}
