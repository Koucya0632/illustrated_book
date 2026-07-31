import type {
  AtlasCollectionLearningState,
  AtlasPublicCollectionDetail,
} from "../atlas-db";

export const PUBLIC_COLLECTION_BOOKMARK_RATE = {
  windowSeconds: 3_600,
  limit: 300,
} as const;

export const PUBLIC_COLLECTION_LEARN_RATE = {
  windowSeconds: 3_600,
  limit: 60,
} as const;

export interface PublicCollectionRateRule {
  bucket: string;
  windowSeconds: number;
  limit: number;
}

export interface PublicCollectionRateResult {
  ok: boolean;
  retryAfterSeconds: number;
}

export interface PublicCollectionRateLimiter {
  hit(rule: PublicCollectionRateRule): Promise<PublicCollectionRateResult>;
}

export interface PublicCollectionCapacity {
  savedItemsLimit(userId: string): Promise<number>;
}

export type PublicCollectionAtomicLearnResult =
  | {
      ok: true;
      addedCount: number;
      learningCount: number;
      totalCount: number;
    }
  | {
      ok: false;
      error: "capacityExceeded";
      limit: number;
      usage: number;
    };

export interface PublicCollectionPersistence {
  findApprovedBySlug(slug: string): Promise<AtlasPublicCollectionDetail | null>;
  isBookmarked(userId: string, collectionId: string): Promise<boolean>;
  saveBookmark(userId: string, collectionId: string): Promise<void>;
  removeBookmark(userId: string, collectionId: string): Promise<void>;
  bookmarkCount(collectionId: string): Promise<number>;
  learningState(userId: string, collectionId: string): Promise<AtlasCollectionLearningState>;
  learnRemainingAtomically(
    userId: string,
    collectionId: string,
    savedItemsLimit: number,
  ): Promise<PublicCollectionAtomicLearnResult>;
}

export interface PublicCollectionAccess {
  unlocked: boolean;
  isOwner: boolean;
  isSaved: boolean;
  totalCount: number;
  learningCount: number;
}

export interface PublicCollectionView {
  collection: AtlasPublicCollectionDetail["collection"];
  items: AtlasPublicCollectionDetail["items"];
  access: PublicCollectionAccess;
}

export interface PublicCollectionBookmarkState {
  saved: boolean;
  saveCount: number;
}

export type PublicCollectionNotFound = {
  ok: false;
  error: "notFound";
};

export type PublicCollectionLocked = {
  ok: false;
  error: "locked";
};

export type PublicCollectionCannotSaveOwn = {
  ok: false;
  error: "cannotSaveOwnCollection";
};

export type PublicCollectionRateLimited = {
  ok: false;
  error: "rateLimited";
  retryAfterSeconds: number;
};

export type PublicCollectionCapacityExceeded = {
  ok: false;
  error: "capacityExceeded";
  limit: number;
  usage: number;
};

export type PublicCollectionOutcome<T, E> = { ok: true; value: T } | E;

export interface PublicCollectionModule {
  detail(input: {
    slug: string;
    userId: string | null;
  }): Promise<PublicCollectionOutcome<PublicCollectionView, PublicCollectionNotFound>>;

  bookmarkState(input: {
    slug: string;
    userId: string;
  }): Promise<PublicCollectionOutcome<PublicCollectionBookmarkState, PublicCollectionNotFound>>;

  bookmark(input: {
    slug: string;
    userId: string;
  }): Promise<
    PublicCollectionOutcome<
      PublicCollectionBookmarkState,
      PublicCollectionNotFound | PublicCollectionCannotSaveOwn | PublicCollectionRateLimited
    >
  >;

  removeBookmark(input: {
    slug: string;
    userId: string;
  }): Promise<PublicCollectionOutcome<PublicCollectionBookmarkState, PublicCollectionNotFound>>;

  learnRemaining(input: {
    slug: string;
    userId: string;
  }): Promise<
    PublicCollectionOutcome<
      {
        addedCount: number;
        learningCount: number;
        totalCount: number;
      },
      | PublicCollectionNotFound
      | PublicCollectionLocked
      | PublicCollectionRateLimited
      | PublicCollectionCapacityExceeded
    >
  >;
}

export function createPublicCollectionModule(dependencies: {
  persistence: PublicCollectionPersistence;
  rateLimiter: PublicCollectionRateLimiter;
  capacity: PublicCollectionCapacity;
}): PublicCollectionModule {
  const { persistence, rateLimiter, capacity } = dependencies;

  async function find(slug: string) {
    return persistence.findApprovedBySlug(slug);
  }

  return {
    async detail({ slug, userId }) {
      const detail = await find(slug);
      if (!detail) return { ok: false, error: "notFound" };

      const isOwner = userId === detail.collection.owner_user_id;
      const isSaved = userId
        ? await persistence.isBookmarked(userId, detail.collection.id)
        : false;
      const unlocked = isOwner || isSaved;
      const learning = userId && unlocked
        ? await persistence.learningState(userId, detail.collection.id)
        : { totalCount: detail.collection.item_count, learningCount: 0 };

      return {
        ok: true,
        value: {
          collection: detail.collection,
          items: unlocked ? detail.items : detail.items.slice(0, 3),
          access: {
            unlocked,
            isOwner,
            isSaved,
            totalCount: learning.totalCount,
            learningCount: learning.learningCount,
          },
        },
      };
    },

    async bookmarkState({ slug, userId }) {
      const detail = await find(slug);
      if (!detail) return { ok: false, error: "notFound" };
      return {
        ok: true,
        value: {
          saved: await persistence.isBookmarked(userId, detail.collection.id),
          saveCount: detail.collection.save_count,
        },
      };
    },

    async bookmark({ slug, userId }) {
      const detail = await find(slug);
      if (!detail) return { ok: false, error: "notFound" };
      if (detail.collection.owner_user_id === userId) {
        return { ok: false, error: "cannotSaveOwnCollection" };
      }

      const rate = await rateLimiter.hit({
        bucket: `atlas-collection-save:user:${userId}`,
        ...PUBLIC_COLLECTION_BOOKMARK_RATE,
      });
      if (!rate.ok) {
        return {
          ok: false,
          error: "rateLimited",
          retryAfterSeconds: rate.retryAfterSeconds,
        };
      }

      await persistence.saveBookmark(userId, detail.collection.id);
      return {
        ok: true,
        value: {
          saved: true,
          saveCount: await persistence.bookmarkCount(detail.collection.id),
        },
      };
    },

    async removeBookmark({ slug, userId }) {
      const detail = await find(slug);
      if (!detail) return { ok: false, error: "notFound" };
      await persistence.removeBookmark(userId, detail.collection.id);
      return {
        ok: true,
        value: {
          saved: false,
          saveCount: await persistence.bookmarkCount(detail.collection.id),
        },
      };
    },

    async learnRemaining({ slug, userId }) {
      const detail = await find(slug);
      if (!detail) return { ok: false, error: "notFound" };

      const isOwner = detail.collection.owner_user_id === userId;
      const isSaved = await persistence.isBookmarked(userId, detail.collection.id);
      if (!isOwner && !isSaved) return { ok: false, error: "locked" };

      const rate = await rateLimiter.hit({
        bucket: `atlas-collection-learn:user:${userId}`,
        ...PUBLIC_COLLECTION_LEARN_RATE,
      });
      if (!rate.ok) {
        return {
          ok: false,
          error: "rateLimited",
          retryAfterSeconds: rate.retryAfterSeconds,
        };
      }

      const savedItemsLimit = await capacity.savedItemsLimit(userId);
      const learned = await persistence.learnRemainingAtomically(
        userId,
        detail.collection.id,
        savedItemsLimit,
      );
      if (!learned.ok) return learned;

      return {
        ok: true,
        value: {
          addedCount: learned.addedCount,
          learningCount: learned.learningCount,
          totalCount: learned.totalCount,
        },
      };
    },
  };
}
