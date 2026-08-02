import assert from "node:assert/strict";
import test from "node:test";
import { createAuthorProfileModule } from "../lib/profile/author-profile";

test("every registered UID resolves even with no public work", async () => {
  const calls: string[] = [];
  const module = createAuthorProfileModule({
    async findAuthor(uid) {
      calls.push(`author:${uid}`);
      return {
        user_id: "u1",
        username: uid,
        nickname: "  Mika  ",
        avatar: null,
        bio: null,
        joined_at: "2026-08-02",
        published_count: 0,
        save_count: 0,
      };
    },
    async listItems() {
      calls.push("items");
      return [] as string[];
    },
    async listCollections() {
      calls.push("collections");
      return [] as string[];
    },
  });

  const result = await module.load(" TJ00000042 ");

  assert.equal(result?.author.displayName, "Mika");
  assert.equal(result?.author.avatar, "face");
  assert.deepEqual(result?.items, []);
  assert.deepEqual(result?.collections, []);
  assert.deepEqual(calls.sort(), ["author:TJ00000042", "collections", "items"]);
});

test("only an exact public UID can query account identity", async () => {
  let queried = false;
  const module = createAuthorProfileModule({
    async findAuthor() {
      queried = true;
      return null;
    },
    async listItems() {
      return [];
    },
    async listCollections() {
      return [];
    },
  });

  assert.equal(await module.load("mika@example.com"), null);
  assert.equal(queried, false);
});
