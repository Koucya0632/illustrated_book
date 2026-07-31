import assert from "node:assert/strict";
import test from "node:test";
import {
  createPublicCollectionModule,
  PUBLIC_COLLECTION_BOOKMARK_RATE,
  PUBLIC_COLLECTION_LEARN_RATE,
  type PublicCollectionAtomicLearnResult,
  type PublicCollectionCapacity,
  type PublicCollectionPersistence,
  type PublicCollectionRateLimiter,
  type PublicCollectionRateRule,
} from "../lib/atlas/public-collection";
import type {
  AtlasCollectionLearningState,
  AtlasPublicCollectionDetail,
} from "../lib/atlas-db";

function collectionDetail(itemCount = 5): AtlasPublicCollectionDetail {
  return {
    collection: {
      id: "collection-1",
      owner_user_id: "owner-1",
      slug: "daily-life",
      title: "生活日常",
      description: null,
      target_language: "ja",
      author_username: "owner",
      author_nickname: "Owner",
      author_avatar: "face",
      item_count: itemCount,
      save_count: 4,
      cover_image_path: null,
      published_at: "2026-07-31T00:00:00.000Z",
    },
    items: Array.from({ length: itemCount }, (_, index) => ({
      id: `item-${index + 1}`,
    })) as AtlasPublicCollectionDetail["items"],
  };
}

class MemoryPersistence implements PublicCollectionPersistence {
  detail: AtlasPublicCollectionDetail | null = collectionDetail();
  bookmarkedUsers = new Set<string>();
  bookmarkWrites: string[] = [];
  removeWrites: string[] = [];
  state: AtlasCollectionLearningState = { totalCount: 5, learningCount: 2 };
  atomicCalls: { userId: string; collectionId: string; savedItemsLimit: number }[] = [];
  atomicResult: PublicCollectionAtomicLearnResult = {
    ok: true,
    addedCount: 3,
    learningCount: 5,
    totalCount: 5,
  };

  async findApprovedBySlug(_slug: string) {
    return this.detail;
  }

  async isBookmarked(userId: string, _collectionId: string) {
    return this.bookmarkedUsers.has(userId);
  }

  async saveBookmark(userId: string, collectionId: string) {
    this.bookmarkWrites.push(`${userId}:${collectionId}`);
    this.bookmarkedUsers.add(userId);
  }

  async removeBookmark(userId: string, collectionId: string) {
    this.removeWrites.push(`${userId}:${collectionId}`);
    this.bookmarkedUsers.delete(userId);
  }

  async bookmarkCount(_collectionId: string) {
    return this.bookmarkedUsers.size + 4;
  }

  async learningState(_userId: string, _collectionId: string) {
    return this.state;
  }

  async learnRemainingAtomically(
    userId: string,
    collectionId: string,
    savedItemsLimit: number,
  ) {
    this.atomicCalls.push({ userId, collectionId, savedItemsLimit });
    return this.atomicResult;
  }
}

class RecordingRateLimiter implements PublicCollectionRateLimiter {
  calls: PublicCollectionRateRule[] = [];
  result = { ok: true, retryAfterSeconds: 0 };

  async hit(rule: PublicCollectionRateRule) {
    this.calls.push(rule);
    return this.result;
  }
}

class FixedCapacity implements PublicCollectionCapacity {
  calls: string[] = [];

  constructor(private readonly limit: number) {}

  async savedItemsLimit(userId: string) {
    this.calls.push(userId);
    return this.limit;
  }
}

function setup(limit = 1_000) {
  const persistence = new MemoryPersistence();
  const rateLimiter = new RecordingRateLimiter();
  const capacity = new FixedCapacity(limit);
  const module = createPublicCollectionModule({ persistence, rateLimiter, capacity });
  return { module, persistence, rateLimiter, capacity };
}

test("guest detail exposes only three approved previews", async () => {
  const { module } = setup();

  const result = await module.detail({ slug: "daily-life", userId: null });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.items.length, 3);
  assert.deepEqual(result.value.access, {
    unlocked: false,
    isOwner: false,
    isSaved: false,
    totalCount: 5,
    learningCount: 0,
  });
});

test("owner and bookmarked reader both unlock the complete collection", async () => {
  const { module, persistence } = setup();
  persistence.bookmarkedUsers.add("reader-1");

  const owner = await module.detail({ slug: "daily-life", userId: "owner-1" });
  const reader = await module.detail({ slug: "daily-life", userId: "reader-1" });

  assert.equal(owner.ok, true);
  assert.equal(reader.ok, true);
  if (!owner.ok || !reader.ok) return;
  assert.equal(owner.value.items.length, 5);
  assert.equal(owner.value.access.isOwner, true);
  assert.equal(reader.value.items.length, 5);
  assert.equal(reader.value.access.isSaved, true);
  assert.equal(reader.value.access.learningCount, 2);
});

test("missing or moderated collection is not found through every read seam", async () => {
  const { module, persistence } = setup();
  persistence.detail = null;

  assert.deepEqual(
    await module.detail({ slug: "gone", userId: null }),
    { ok: false, error: "notFound" },
  );
  assert.deepEqual(
    await module.bookmarkState({ slug: "gone", userId: "reader-1" }),
    { ok: false, error: "notFound" },
  );
});

test("author cannot bookmark their own collection", async () => {
  const { module, persistence, rateLimiter } = setup();

  const result = await module.bookmark({ slug: "daily-life", userId: "owner-1" });

  assert.deepEqual(result, { ok: false, error: "cannotSaveOwnCollection" });
  assert.deepEqual(rateLimiter.calls, []);
  assert.deepEqual(persistence.bookmarkWrites, []);
});

test("bookmark owns its rate policy and returns confirmed count", async () => {
  const { module, persistence, rateLimiter } = setup();

  const result = await module.bookmark({ slug: "daily-life", userId: "reader-1" });

  assert.deepEqual(rateLimiter.calls, [{
    bucket: "atlas-collection-save:user:reader-1",
    ...PUBLIC_COLLECTION_BOOKMARK_RATE,
  }]);
  assert.deepEqual(persistence.bookmarkWrites, ["reader-1:collection-1"]);
  assert.deepEqual(result, {
    ok: true,
    value: { saved: true, saveCount: 5 },
  });
});

test("rate-limited bookmark performs no write", async () => {
  const { module, persistence, rateLimiter } = setup();
  rateLimiter.result = { ok: false, retryAfterSeconds: 17 };

  const result = await module.bookmark({ slug: "daily-life", userId: "reader-1" });

  assert.deepEqual(result, {
    ok: false,
    error: "rateLimited",
    retryAfterSeconds: 17,
  });
  assert.deepEqual(persistence.bookmarkWrites, []);
});

test("removing a bookmark is idempotent and not rate-limited", async () => {
  const { module, persistence, rateLimiter } = setup();
  persistence.bookmarkedUsers.add("reader-1");

  const result = await module.removeBookmark({ slug: "daily-life", userId: "reader-1" });

  assert.deepEqual(rateLimiter.calls, []);
  assert.deepEqual(persistence.removeWrites, ["reader-1:collection-1"]);
  assert.deepEqual(result, {
    ok: true,
    value: { saved: false, saveCount: 4 },
  });
});

test("locked reader cannot batch-learn", async () => {
  const { module, persistence, rateLimiter, capacity } = setup();

  const result = await module.learnRemaining({ slug: "daily-life", userId: "reader-1" });

  assert.deepEqual(result, { ok: false, error: "locked" });
  assert.deepEqual(rateLimiter.calls, []);
  assert.deepEqual(capacity.calls, []);
  assert.deepEqual(persistence.atomicCalls, []);
});

test("batch learning owns rate policy and crosses one atomic persistence seam", async () => {
  const { module, persistence, rateLimiter, capacity } = setup(1_234);
  persistence.bookmarkedUsers.add("reader-1");

  const result = await module.learnRemaining({ slug: "daily-life", userId: "reader-1" });

  assert.deepEqual(rateLimiter.calls, [{
    bucket: "atlas-collection-learn:user:reader-1",
    ...PUBLIC_COLLECTION_LEARN_RATE,
  }]);
  assert.deepEqual(capacity.calls, ["reader-1"]);
  assert.deepEqual(persistence.atomicCalls, [{
    userId: "reader-1",
    collectionId: "collection-1",
    savedItemsLimit: 1_234,
  }]);
  assert.deepEqual(result, {
    ok: true,
    value: { addedCount: 3, learningCount: 5, totalCount: 5 },
  });
});

test("atomic capacity failure survives as a typed outcome", async () => {
  const { module, persistence } = setup(10);
  persistence.bookmarkedUsers.add("reader-1");
  persistence.atomicResult = {
    ok: false,
    error: "capacityExceeded",
    limit: 10,
    usage: 9,
  };

  const result = await module.learnRemaining({ slug: "daily-life", userId: "reader-1" });

  assert.deepEqual(result, {
    ok: false,
    error: "capacityExceeded",
    limit: 10,
    usage: 9,
  });
});
