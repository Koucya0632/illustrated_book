// JSON shapes for the public community endpoints (items + collections). Kept in
// one place because the feed, detail, collection and edit routes all emit the
// same client-facing shape, and the iOS models decode exactly these keys.
//
// Author identity has exactly ONE source here — `publicAuthor()`. Two rules it
// exists to enforce, both of which used to be violated inline:
//
//   1. `nickname` and `username` are private fields (an in-app greeting seeded
//      from the Apple full name, and a login handle that used to be the email
//      local part). They may only leave the server for a user who confirmed a
//      public identity, so an unconfirmed author serializes to `null`.
//   2. handle and display name are different things. `attribution_name` was a
//      single string doing both jobs, which meant the author link 404'd
//      whenever it held a display name.

import "server-only";
import { atlasPublicImageUrl } from "./storage";
import { publicAuthor } from "../public-author";
import type { AtlasPublicItemWithAuthorRow } from "./types";
import type { AtlasPublicCollectionCardRow } from "../atlas-db";

export function serializeAtlasPublicItem(row: AtlasPublicItemWithAuthorRow) {
  return {
    id: row.id,
    slug: row.public_slug,
    lemma: row.lemma,
    displayZhHant: row.display_zh_hant,
    targetLanguage: row.target_language,
    category: row.category,
    imageUrl: atlasPublicImageUrl(row.image_public_path),
    author: publicAuthor(row),
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
    author: publicAuthor({
      author_username: row.author_username,
      author_nickname: row.author_nickname,
      author_avatar: row.author_avatar,
    }),
    itemCount: row.item_count,
    saveCount: row.save_count,
    coverImageUrl: atlasPublicImageUrl(row.cover_image_path),
    publishedAt: row.published_at,
  };
}
