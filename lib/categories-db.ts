// DB-aware loader for categories. Server-only because it imports the
// postgres driver via lib/db. Use `categories` from `lib/categories` for
// the client-safe static list — it stays in sync via scripts/migrate.ts.

import "server-only";
import type { Category } from "@/types";
import { categories as staticCategories } from "./categories";
import { getSql } from "./db";

export async function getCategoriesFromDb(): Promise<Category[]> {
  const sql = getSql();
  if (!sql) return staticCategories;
  try {
    const rows = (await sql`
      SELECT id, name, name_zh, emoji, description, color, image_url, sort_order
      FROM categories
      ORDER BY sort_order, id
    `) as unknown as Array<{
      id: string;
      name: string;
      name_zh: string;
      emoji: string;
      description: string | null;
      color: string | null;
      image_url: string | null;
      sort_order: number;
    }>;
    if (rows.length === 0) return staticCategories;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      nameZh: r.name_zh,
      emoji: r.emoji,
      description: r.description ?? "",
      color: r.color ?? "",
      imageUrl: r.image_url ?? "",
    }));
  } catch {
    return staticCategories;
  }
}
