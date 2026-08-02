import assert from "node:assert/strict";
import test from "node:test";
import {
  createProfileEditModule,
  ProfileEditError,
  type ProfileEditDependencies,
} from "../lib/profile/profile-edit-core";
import { runAtlasTextModeration } from "../lib/atlas/moderation";

function harness(overrides: Partial<ProfileEditDependencies> = {}) {
  const calls: string[] = [];
  let saved = { nickname: null as string | null, bio: null as string | null, avatar: "face" };
  const dependencies: ProfileEditDependencies = {
    moderateText(value) {
      return runAtlasTextModeration([value]);
    },
    async processImage(bytes) {
      calls.push("process");
      return bytes;
    },
    async moderateImage() {
      calls.push("moderate-image");
      return "accepted";
    },
    async uploadImage() {
      calls.push("upload");
      return "https://example.supabase.co/storage/v1/object/public/user-avatars/u1/new.webp";
    },
    async persist(_userId, fields) {
      calls.push("persist");
      saved = { ...saved, ...fields };
    },
    async read() {
      calls.push("read");
      return {
        username: "TJ00000042",
        nickname: saved.nickname,
        avatar: saved.avatar,
        bio: saved.bio,
        publishedCount: 3,
        saveCount: 7,
      };
    },
    async mirror() {
      calls.push("mirror");
    },
    async cleanupImages() {
      calls.push("cleanup");
    },
    reportRepairableFailure(kind) {
      calls.push(`repair:${kind}`);
    },
    ...overrides,
  };
  return { module: createProfileEditModule(dependencies), calls };
}

test("nickname, bio and image become one projected identity", async () => {
  const { module, calls } = harness();
  const result = await module.edit("u1", {
    nickname: "  Mika  ",
    bio: "  喜歡拍招牌  ",
    image: { bytes: new Uint8Array([1]), mimeType: "image/jpeg", size: 1 },
  });

  assert.equal(result.author.displayName, "Mika");
  assert.equal(result.author.bio, "喜歡拍招牌");
  assert.equal(result.author.publishedCount, 3);
  assert.deepEqual(calls.slice(0, 5), ["process", "moderate-image", "upload", "persist", "read"]);
});

test("nickname and bio cross the same public-text moderation seam", async () => {
  for (const command of [
    { nickname: "mika@example.com", bio: "乾淨" },
    { nickname: "Mika", bio: "https://example.com" },
  ]) {
    const { module, calls } = harness();
    await assert.rejects(module.edit("u1", command), ProfileEditError);
    assert.equal(calls.includes("persist"), false);
  }
});

test("blank nickname falls back to UID and blank bio clears", async () => {
  const { module } = harness();
  const result = await module.edit("u1", { nickname: "   ", bio: "  " });
  assert.equal(result.author.displayName, "TJ00000042");
  assert.equal(result.author.bio, "");
});

test("derived mirror and cleanup failures do not roll back an accepted edit", async () => {
  const { module, calls } = harness({
    async mirror() {
      throw new Error("mirror down");
    },
    async cleanupImages() {
      throw new Error("cleanup down");
    },
  });
  const result = await module.edit("u1", { nickname: "Mika", bio: "", avatar: "face" });
  assert.equal(result.ok, true);
  assert.ok(calls.includes("repair:mirror"));
  assert.ok(calls.includes("repair:cleanup"));
});
