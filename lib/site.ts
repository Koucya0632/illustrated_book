// Canonical public origin. Every alias of the production deployment
// (tuji.nexflow.team, *.vercel.app) serves the same pages; canonical URLs,
// the sitemap and Open Graph links all point here so search engines index one.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://tuji.nexflow.team").replace(
  /\/+$/,
  "",
);

// `custom` and `community` are per-user decks, not topics: empty for anonymous
// visitors, so they stay out of the sitemap and the homepage index.
const PERSONAL_CATEGORY_IDS = new Set(["custom", "community"]);

export function isPublicTopicCategory(id: string): boolean {
  return !PERSONAL_CATEGORY_IDS.has(id);
}
