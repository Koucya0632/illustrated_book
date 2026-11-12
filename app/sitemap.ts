import type { MetadataRoute } from "next";
import { getCategoriesFromDb } from "@/lib/categories-db";
import { getAllWords } from "@/lib/data";
import { SITE_URL, isPublicTopicCategory } from "@/lib/site";
import { loadTravelSite } from "@/lib/travel/site";

// The catalogue changes a few times a week at most.
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, words, travel] = await Promise.all([
    getCategoriesFromDb("zh-Hant"),
    getAllWords("zh-Hant"),
    loadTravelSite("zh-Hant"),
  ]);

  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    ...categories
      .filter((c) => isPublicTopicCategory(c.id))
      .map((c) => ({
        url: `${SITE_URL}/category/${c.id}`,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ...words.map((w) => ({
      url: `${SITE_URL}/word/${encodeURIComponent(w.id)}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
      ...(w.imageUrl ? { images: [w.imageUrl] } : {}),
    })),
    // 跟著 Moira 去旅遊: only what has a page — a closed spot has none.
    ...(travel.cities.length > 0
      ? [{ url: `${SITE_URL}/travel`, changeFrequency: "weekly" as const, priority: 0.7 }]
      : []),
    ...travel.cities.flatMap((city) => [
      { url: `${SITE_URL}/travel/${city.id}`, changeFrequency: "weekly" as const, priority: 0.7 },
      ...city.spots
        .filter((spot) => spot.open)
        .map((spot) => ({
          url: `${SITE_URL}/travel/${city.id}/${spot.id}`,
          changeFrequency: "weekly" as const,
          priority: 0.8,
        })),
    ]),
    { url: `${SITE_URL}/support`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.1 },
  ];
}
