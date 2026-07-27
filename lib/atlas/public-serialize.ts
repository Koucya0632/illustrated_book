// JSON shapes for the public community endpoints (items + collections). Kept in
// one place because the feed, detail, collection and edit routes all emit the
// same client-facing shape, and the iOS models decode exactly these keys.

import "server-only";
import { atlasPublicImageUrl } from "./storage";
import type { AtlasPublicItemRow } from "./types";
import type { AtlasPublicCollectionCardRow } from "../atlas-db";

export function serializeAtlasPublicItem(row: AtlasPublicItemRow) {
  return {
    id: row.id,
    slug: row.public_slug,
    lemma: row.lemma,
    displayZhHant: row.display_zh_hant,
    targetLanguage: row.target_language,
    category: row.category,
    imageUrl: atlasPublicImageUrl(row.image_public_path),
    attributionName: row.attribution_name,
    publishedAt: row.published_at,
  };
}

export function serializeAtlasPublicCollectionCard(row: AtlasPublicCollectionCardRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    targetLanguage: row.target_language,
    author: {
      username: row.author_username,
      displayName: row.author_nickname ?? row.author_username,
      avatar: row.author_avatar ?? "",
    },
    itemCount: row.item_count,
    saveCount: row.save_count,
    coverImageUrl: atlasPublicImageUrl(row.cover_image_path),
    publishedAt: row.published_at,
  };
}
