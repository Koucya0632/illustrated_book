import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../scripts/migrate.ts", import.meta.url), "utf8");
const publicSerializer = readFileSync(
  new URL("../lib/atlas/public-serialize.ts", import.meta.url),
  "utf8",
);
const ownerRoute = readFileSync(
  new URL("../app/api/atlas/collections/[id]/route.ts", import.meta.url),
  "utf8",
);
const storage = readFileSync(new URL("../lib/atlas/storage.ts", import.meta.url), "utf8");

test("the database accepts only canonical lowercase collection colors", () => {
  assert.match(
    migration,
    /avatar_color IS NULL OR avatar_color ~ '\^#\[0-9a-f\]\{6\}\$'/,
  );
});

test("public collection JSON exposes the collection avatar separately from its fallback color", () => {
  assert.match(publicSerializer, /avatarColor:\s*row\.avatar_color/);
  assert.match(
    publicSerializer,
    /avatarImageUrl:\s*collectionAvatarPublicUrl\(row\.avatar_image_path\)/,
  );
  assert.doesNotMatch(publicSerializer, /avatarImageUrl:[^\n]*(?:coverImageUrl|cover_image_url)/);
  assert.doesNotMatch(publicSerializer, /avatar_private_path|avatarPreviewUrl/);
});

test("the owner edit response receives a preview without exposing the storage path", () => {
  assert.match(ownerRoute, /getOwnedAtlasCollection/);
  assert.match(ownerRoute, /createCollectionAvatarSignedUrl/);
  assert.match(ownerRoute, /avatarPreviewUrl/);
  assert.match(ownerRoute, /avatarColor:\s*owned\.collection\.avatar_color/);
});

test("new collection avatars use the public image bucket, not the legacy private bucket", () => {
  const upload = storage.slice(
    storage.indexOf("export async function uploadCollectionAvatar"),
    storage.indexOf("export async function createCollectionAvatarSignedUrl"),
  );
  assert.match(upload, /ensureAtlasPublicBucket/);
  assert.match(upload, /putPublicObject\(ATLAS_PUBLIC_BUCKET/);
  assert.doesNotMatch(upload, /ATLAS_PRIVATE_BUCKET/);
});
