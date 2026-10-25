import { MAIN_WORD_PHONE_INTERNET_IDS } from "./main-word-phone-internet-2026-10";
import { MAIN_WORD_IDENTITY_DOCUMENTS_IDS } from "./main-word-identity-documents-2026-10";
import { MAIN_WORD_AIRPORT_IDS } from "./main-word-airport-2026-10";
import { MAIN_WORD_POSTAL_SERVICES_IDS } from "./main-word-postal-services-2026-10";
import { MAIN_WORD_BANK_IDS } from "./main-word-bank-2026-10";
// DB-aware loader for categories. Server-only because it imports the
// postgres driver via lib/db. Use `categories` from `lib/categories` for
// the client-safe static list — it stays in sync via scripts/migrate.ts.

import "server-only";
import { MAIN_WORD_ARCADE_IDS } from "./main-word-arcade-2026-10";
import type { Category } from "@/types";
import { publicFallbackCategories as staticCategories } from "./categories";
import { localizeCategory, type CategoryTranslation } from "./word-localize";
import type { UiLang } from "./settings";
import { getSql } from "./db";
import { MAIN_WORD_RESTAURANT_IDS } from "./main-word-restaurant-2026-10";
import { MAIN_WORD_CONCERT_FAN_SUPPORT_IDS } from "./main-word-concert-fan-support-2026-10";
import { MAIN_WORD_STATION_COMMUTING_IDS } from "./main-word-station-commuting-2026-10";
import { MAIN_WORD_FESTIVALS_IDS } from "./main-word-festivals-2026-10";
import { MAIN_WORD_CHERRY_BLOSSOM_SEASON_IDS } from "./main-word-cherry-blossom-season-2026-10";
import { MAIN_WORD_HAIR_SALON_IDS } from "./main-word-hair-salon-2026-10";
import { MAIN_WORD_EMERGENCY_KIT_IDS } from "./main-word-emergency-kit-2026-10";
import { MAIN_WORD_CAMPUS_IDS } from "./main-word-campus-2026-10";
import { MAIN_WORD_ONSEN_RYOKAN_IDS } from "./main-word-onsen-ryokan-2026-10";
import { MAIN_WORD_COLLECTING_HOBBIES_IDS } from "./main-word-collecting-hobbies-2026-10";

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
      WHERE (c.id <> 'restaurant' OR NOT EXISTS (
        SELECT 1 FROM unnest(${MAIN_WORD_RESTAURANT_IDS}::text[]) AS planned(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM words w WHERE w.id = planned.id
            AND w.category = 'restaurant' AND w.status = 'published'
            AND w.deleted_at IS NULL
        )
      )) AND (c.id <> 'concert-fan-support' OR NOT EXISTS (
        SELECT 1 FROM unnest(${MAIN_WORD_CONCERT_FAN_SUPPORT_IDS}::text[]) AS planned(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM words w WHERE w.id = planned.id
            AND w.category = 'concert-fan-support' AND w.status = 'published'
            AND w.deleted_at IS NULL
        )
      )) AND (c.id <> 'station-commuting' OR NOT EXISTS (
        SELECT 1 FROM unnest(${MAIN_WORD_STATION_COMMUTING_IDS}::text[]) AS planned(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM words w WHERE w.id = planned.id
            AND w.category = 'station-commuting' AND w.status = 'published'
            AND w.deleted_at IS NULL
        )
      )) AND (c.id <> 'festivals' OR NOT EXISTS (
        SELECT 1 FROM unnest(${MAIN_WORD_FESTIVALS_IDS}::text[]) AS planned(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM words w WHERE w.id = planned.id
            AND w.category = 'festivals' AND w.status = 'published'
            AND w.deleted_at IS NULL
        )
      )) AND (c.id <> 'cherry-blossom-season' OR NOT EXISTS (
        SELECT 1 FROM unnest(${MAIN_WORD_CHERRY_BLOSSOM_SEASON_IDS}::text[]) AS planned(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM words w WHERE w.id = planned.id
            AND w.category = 'cherry-blossom-season' AND w.status = 'published'
            AND w.deleted_at IS NULL
        )
      )) AND (c.id <> 'collecting-hobbies' OR NOT EXISTS (
        SELECT 1 FROM unnest(${MAIN_WORD_COLLECTING_HOBBIES_IDS}::text[]) AS planned(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM words w WHERE w.id = planned.id
            AND w.category = 'collecting-hobbies' AND w.status = 'published'
            AND w.deleted_at IS NULL
        )
      )) AND (c.id <> 'arcade' OR NOT EXISTS (
        SELECT 1 FROM unnest(${MAIN_WORD_ARCADE_IDS}::text[]) AS planned(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM words w WHERE w.id = planned.id
            AND w.category = 'arcade' AND w.status = 'published'
            AND w.deleted_at IS NULL
        )
      )) AND (c.id <> 'campus' OR NOT EXISTS (
        SELECT 1 FROM unnest(${MAIN_WORD_CAMPUS_IDS}::text[]) AS planned(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM words w WHERE w.id = planned.id
            AND w.category = 'campus' AND w.status = 'published'
            AND w.deleted_at IS NULL
        )
      )) AND (c.id <> 'onsen-ryokan' OR NOT EXISTS (
        SELECT 1 FROM unnest(${MAIN_WORD_ONSEN_RYOKAN_IDS}::text[]) AS planned(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM words w WHERE w.id = planned.id
            AND w.category = 'onsen-ryokan' AND w.status = 'published'
            AND w.deleted_at IS NULL
        )
      )) AND (c.id <> 'emergency-kit' OR NOT EXISTS (
        SELECT 1 FROM unnest(${MAIN_WORD_EMERGENCY_KIT_IDS}::text[]) AS planned(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM words w WHERE w.id = planned.id
            AND w.category = 'emergency-kit' AND w.status = 'published'
            AND w.deleted_at IS NULL
        )
      ))
      AND (c.id <> 'hair-salon' OR NOT EXISTS (
        SELECT 1 FROM unnest(${MAIN_WORD_HAIR_SALON_IDS}::text[]) AS planned(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM words w WHERE w.id = planned.id
            AND w.category = 'hair-salon' AND w.status = 'published'
            AND w.deleted_at IS NULL
        )
      ))
      AND (c.id <> 'bank' OR NOT EXISTS (
        SELECT 1 FROM unnest(${MAIN_WORD_BANK_IDS}::text[]) AS planned(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM words w WHERE w.id = planned.id
            AND w.category = 'bank' AND w.status = 'published'
            AND w.deleted_at IS NULL
        )
      ))
      AND (c.id <> 'postal-services' OR NOT EXISTS (
        SELECT 1 FROM unnest(${MAIN_WORD_POSTAL_SERVICES_IDS}::text[]) AS planned(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM words w WHERE w.id = planned.id
            AND w.category = 'postal-services' AND w.status = 'published'
            AND w.deleted_at IS NULL
        )
      ))
      AND (c.id <> 'identity-documents' OR NOT EXISTS (
        SELECT 1 FROM unnest(${MAIN_WORD_IDENTITY_DOCUMENTS_IDS}::text[]) AS planned(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM words w WHERE w.id = planned.id
            AND w.category = 'identity-documents' AND w.status = 'published'
            AND w.deleted_at IS NULL
        )
      ))
      AND (c.id <> 'airport' OR NOT EXISTS (
        SELECT 1 FROM unnest(${MAIN_WORD_AIRPORT_IDS}::text[]) AS planned(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM words w WHERE w.id = planned.id
            AND w.category = 'airport' AND w.status = 'published'
            AND w.deleted_at IS NULL
        )
      ))
      AND (c.id <> 'phone-internet' OR NOT EXISTS (
        SELECT 1 FROM unnest(${MAIN_WORD_PHONE_INTERNET_IDS}::text[]) AS planned(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM words w WHERE w.id = planned.id
            AND w.category = 'phone-internet' AND w.status = 'published'
            AND w.deleted_at IS NULL
        )
      ))
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
