import assert from "node:assert/strict";
import test from "node:test";
import {
  CollectionAvatarError,
  createCollectionAvatarModule,
  type CollectionAvatarDependencies,
} from "../lib/atlas/collection-avatar-core";

function harness(overrides: Partial<CollectionAvatarDependencies> = {}) {
  let saved = {
    avatarPath: "owner/collection/old.webp" as string | null,
    avatarColor: "#345678" as string | null,
  };
  const objects = new Set([saved.avatarPath!]);
  const dependencies: CollectionAvatarDependencies = {
    async readOwned() {
      return saved;
    },
    async processImage() {
      return { bytes: new Uint8Array([9, 9]), color: "#4a7096" };
    },
    async moderateImage() {
      return "accepted";
    },
    async uploadImage() {
      const path = "owner/collection/new.webp";
      objects.add(path);
      return path;
    },
    async persist(_userId, _collectionId, avatar) {
      saved = { avatarPath: avatar.path, avatarColor: avatar.color };
      return true;
    },
    async previewImage(path) {
      return `https://signed.example/${path}`;
    },
    async removeImage(path) {
      objects.delete(path);
    },
    reportRepairableFailure() {},
    ...overrides,
  };
  return {
    module: createCollectionAvatarModule(dependencies),
    current: () => saved,
    objects,
  };
}

test("an owner replaces a collection avatar as one accepted identity change", async () => {
  const { module, current, objects } = harness();

  const result = await module.replace("owner", "collection", {
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: "image/jpeg",
    size: 3,
  });

  assert.deepEqual(result, {
    ok: true,
    avatarColor: "#4a7096",
    avatarImageUrl: "https://signed.example/owner/collection/new.webp",
    avatarPreviewUrl: "https://signed.example/owner/collection/new.webp",
  });
  assert.deepEqual(current(), {
    avatarPath: "owner/collection/new.webp",
    avatarColor: "#4a7096",
  });
  assert.deepEqual([...objects], ["owner/collection/new.webp"]);
});

test("a non-owner cannot replace or discover a collection avatar", async () => {
  const { module, current } = harness({ readOwned: async () => null });

  await assert.rejects(
    module.replace("stranger", "collection", {
      bytes: new Uint8Array([1]),
      mimeType: "image/jpeg",
      size: 1,
    }),
    (error: unknown) => error instanceof CollectionAvatarError && error.status === 404,
  );
  assert.equal(current().avatarPath, "owner/collection/old.webp");
});

test("unsupported and oversized images leave the accepted avatar untouched", async () => {
  for (const image of [
    { bytes: new Uint8Array([1]), mimeType: "image/gif", size: 1 },
    { bytes: new Uint8Array([1]), mimeType: "image/jpeg", size: 8 * 1024 * 1024 + 1 },
  ]) {
    const { module, current } = harness();
    await assert.rejects(
      module.replace("owner", "collection", image),
      (error: unknown) =>
        error instanceof CollectionAvatarError && error.code === "invalid_image",
    );
    assert.equal(current().avatarPath, "owner/collection/old.webp");
  }
});

test("a spoofed content type is reported as an invalid image without changing identity", async () => {
  const { module, current, objects } = harness({
    processImage: async () => {
      throw new Error("unsupported image format");
    },
  });

  await assert.rejects(
    module.replace("owner", "collection", {
      bytes: new Uint8Array([0, 1, 2]),
      mimeType: "image/jpeg",
      size: 3,
    }),
    (error: unknown) =>
      error instanceof CollectionAvatarError &&
      error.code === "invalid_image" &&
      error.status === 400,
  );
  assert.equal(current().avatarPath, "owner/collection/old.webp");
  assert.deepEqual([...objects], ["owner/collection/old.webp"]);
});

test("moderation rejection and outage preserve the previous avatar", async () => {
  for (const [verdict, code, status] of [
    ["rejected", "avatar_rejected", 422],
    ["unavailable", "moderation_unavailable", 503],
  ] as const) {
    const { module, current, objects } = harness({
      moderateImage: async () => verdict,
    });
    await assert.rejects(
      module.replace("owner", "collection", {
        bytes: new Uint8Array([1]),
        mimeType: "image/jpeg",
        size: 1,
      }),
      (error: unknown) =>
        error instanceof CollectionAvatarError &&
        error.code === code &&
        error.status === status,
    );
    assert.equal(current().avatarPath, "owner/collection/old.webp");
    assert.deepEqual([...objects], ["owner/collection/old.webp"]);
  }
});

test("a preview failure removes the uncommitted upload and keeps the old avatar", async () => {
  const { module, current, objects } = harness({
    previewImage: async () => {
      throw new Error("signing unavailable");
    },
  });

  await assert.rejects(
    module.replace("owner", "collection", {
      bytes: new Uint8Array([1]),
      mimeType: "image/jpeg",
      size: 1,
    }),
  );
  assert.equal(current().avatarPath, "owner/collection/old.webp");
  assert.deepEqual([...objects], ["owner/collection/old.webp"]);
});

test("a database failure removes the upload and never overwrites the old identity", async () => {
  const { module, current, objects } = harness({
    persist: async () => {
      throw new Error("database unavailable");
    },
  });

  await assert.rejects(
    module.replace("owner", "collection", {
      bytes: new Uint8Array([1]),
      mimeType: "image/jpeg",
      size: 1,
    }),
  );
  assert.deepEqual(current(), {
    avatarPath: "owner/collection/old.webp",
    avatarColor: "#345678",
  });
  assert.deepEqual([...objects], ["owner/collection/old.webp"]);
});
