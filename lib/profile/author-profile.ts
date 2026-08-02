import {
  isValidPublicUid,
  projectAuthorIdentity,
  type AuthorIdentity,
} from "@/lib/public-author";

export interface AuthorProfileRecord {
  user_id: string;
  username: string;
  nickname: string | null;
  avatar: string | null;
  bio: string | null;
  joined_at: string | null;
  published_count: number;
  save_count: number;
}

export interface AuthorProfileResponse<Item, Collection> {
  author: AuthorIdentity;
  items: Item[];
  collections: Collection[];
}

export interface AuthorProfileDependencies<Item, Collection> {
  findAuthor(uid: string): Promise<AuthorProfileRecord | null>;
  listItems(userId: string): Promise<Item[]>;
  listCollections(userId: string): Promise<Collection[]>;
}

/**
 * Deep Author-profile module: callers know only `load(uid)`. Account
 * existence, zero-item behavior, identity fallback, counts, and concurrent
 * work loading stay behind this interface.
 */
export function createAuthorProfileModule<Item, Collection>(
  dependencies: AuthorProfileDependencies<Item, Collection>,
) {
  return {
    async load(uid: string): Promise<AuthorProfileResponse<Item, Collection> | null> {
      const normalizedUid = uid.trim();
      if (!isValidPublicUid(normalizedUid)) return null;

      const row = await dependencies.findAuthor(normalizedUid);
      if (!row) return null;

      const [items, collections] = await Promise.all([
        dependencies.listItems(row.user_id),
        dependencies.listCollections(row.user_id),
      ]);

      return {
        author: projectAuthorIdentity({
          username: row.username,
          nickname: row.nickname,
          avatar: row.avatar,
          bio: row.bio,
          joinedAt: row.joined_at,
          publishedCount: row.published_count,
          saveCount: row.save_count,
        }),
        items,
        collections,
      };
    },
  };
}
