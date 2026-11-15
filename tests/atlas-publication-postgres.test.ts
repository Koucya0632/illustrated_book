// The 物見 publication lifecycle against real PostgreSQL
// (lib/atlas/publication.ts; run by scripts/test-credits-integration.mjs).
//
// THE RED LINES:
//   - An item reports pulled back stays hidden until a human decides: its
//     author can neither re-submit it nor withdraw-and-re-submit it.
//   - Rejecting an item that is already live takes it off 物見.
//   - Reports count toward a takedown only while open; a decision closes them.
//     「不是在這裡拍的」 never counts, and upholding it leaves the card public.
//   - Withdrawing and a takedown end sharing to a 景點; a takedown is final.
//   - The public row follows the owner's 景點 choice, including through a
//     re-confirm and a 合集's publication.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import postgres from "postgres";
import { ATLAS_SPOT_DDL } from "../lib/atlas/spot-schema";
import { createAtlasPublication, type PublicationPorts, type ScreenDecision } from "../lib/atlas/publication";
import { saveConfirmedItem } from "../lib/atlas/item-writes";

const databaseUrl = process.env.CREDIT_TEST_DATABASE_URL;

const TABLES = [
  "profiles", "user_atlas_images", "user_atlas_recognition_jobs", "user_atlas_candidates", "user_atlas_items",
  "atlas_moderation_events", "user_moderation_state", "atlas_public_items", "atlas_saved_cards", "atlas_reports",
  "atlas_collections", "atlas_collection_items",
];

/** The real additive DDL from scripts/migrate.ts for the tables above, in order. */
function lifecycleDdl(): string[] {
  const migration = readFileSync(new URL("../scripts/migrate.ts", import.meta.url), "utf8");
  const start = migration.indexOf("const DDL = [");
  const end = migration.indexOf("\n];", start);
  const body = migration.slice(start, end);
  const statements = [...body.matchAll(/`([\s\S]*?)`/g)].map((m) => m[1]);
  const mentions = (s: string) => TABLES.some((t) => new RegExp(`\\b${t}\\b`).test(s));
  return statements.filter((s) => mentions(s) && !s.includes("${") && !/POLICY|auth\.uid|storage\./.test(s));
}

const approved = (thumbPath: string | null): ScreenDecision => ({
  reviewStatus: "approved", verdict: "approved", categories: [], scores: {}, degraded: false, thumbPath,
});

test("物見 publication lifecycle with real PostgreSQL", { skip: !databaseUrl }, async (t) => {
  const url = new URL(databaseUrl!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  const sql = postgres(databaseUrl!, { max: 10, onnotice: () => {} });
  try {
    await sql`CREATE SCHEMA IF NOT EXISTS auth`;
    await sql`CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY)`;
    await sql`CREATE TABLE IF NOT EXISTS words (id TEXT PRIMARY KEY)`;
    for (const statement of lifecycleDdl()) {
      try {
        await sql.unsafe(statement);
      } catch {
        // Statements about tables this test leaves out (or backfills that need
        // them) are not its business; the checks below say what must exist.
      }
    }
    for (const statement of ATLAS_SPOT_DDL) await sql.unsafe(statement);
    for (const table of TABLES) {
      const [row] = await sql<{ ok: boolean }[]>`SELECT to_regclass(${table}) IS NOT NULL AS ok`;
      assert.ok(row.ok, `missing ${table}`);
    }

    let screen: ScreenDecision = approved("thumbs/x.webp");
    const published: string[] = [];
    const removed: string[] = [];
    const ports: PublicationPorts = {
      screen: async () => screen,
      publishShareImage: async ({ publicItemId }) => {
        published.push(publicItemId);
        return { path: `${publicItemId}/thumb.webp` };
      },
      removePublicObjects: async (paths) => {
        removed.push(...paths);
      },
      escalateAt: 3,
    };
    const pub = createAtlasPublication(sql, ports);

    async function user(): Promise<string> {
      const id = randomUUID();
      await sql`INSERT INTO auth.users (id) VALUES (${id})`;
      await sql`INSERT INTO profiles (id, username) VALUES (${id}, ${"TJ" + id.slice(0, 8)}) ON CONFLICT (id) DO NOTHING`;
      return id;
    }
    async function card(owner: string, lang = "ja"): Promise<string> {
      const imageId = randomUUID(), itemId = randomUUID();
      await sql`INSERT INTO user_atlas_images (id, user_id, status, original_path, thumb_path, recognition_path, mime_type, byte_size, sha256)
        VALUES (${imageId}, ${owner}, 'cards_ready', 'o.webp', 'thumbs/x.webp', 'r.webp', 'image/webp', 10, ${imageId})`;
      await sql`INSERT INTO user_atlas_items (id, user_id, image_id, target_language, primary_label, lemma, display_zh_hant, correction_source)
        VALUES (${itemId}, ${owner}, ${imageId}, ${lang}, 'lantern', ${"提灯" + itemId.slice(0, 4)}, '燈籠', 'candidate')`;
      return itemId;
    }
    const item = async (id: string) => (await sql`SELECT * FROM user_atlas_items WHERE id = ${id}`)[0];
    const publicRow = async (id: string) => (await sql`SELECT * FROM atlas_public_items WHERE source_item_id = ${id}`)[0];
    const slugOf = async (id: string) => (await publicRow(id)).public_slug as string;
    async function live(owner: string): Promise<string> {
      const id = await card(owner);
      const submitted = await pub.submit(owner, id);
      assert.ok(submitted.ok && submitted.published);
      return id;
    }
    const report = (slug: string, reporter: string, reason = "spam") =>
      pub.fileReport({ subject: { type: "item", slug }, reporterUserId: reporter, reason, detail: null });

    await t.test("a clean submission goes live; only draft, rejected and withdrawn may be submitted", async () => {
      const owner = await user();
      const id = await live(owner);
      assert.equal((await item(id)).review_status, "approved");
      assert.equal((await publicRow(id)).review_status, "approved");
      const again = await pub.submit(owner, id);
      assert.deepEqual(again, { ok: false, reason: "not_allowed" });
      assert.deepEqual(await pub.submit(await user(), id), { ok: false, reason: "not_found" });
    });

    await t.test("an item reports pulled back cannot be put back up by its author", async () => {
      const owner = await user();
      const id = await live(owner);
      const slug = await slugOf(id);
      for (let i = 0; i < 3; i++) await report(slug, await user());
      assert.equal((await item(id)).review_status, "pending_review");
      assert.equal((await publicRow(id)).review_status, "takedown");

      assert.deepEqual(await pub.submit(owner, id), { ok: false, reason: "not_allowed" });
      assert.deepEqual(await pub.withdraw(owner, id), { ok: false, reason: "not_allowed" });
      assert.equal((await publicRow(id)).review_status, "takedown", "still hidden");

      // A human approves it: back up, and the reports that pulled it are closed.
      const decided = await pub.moderate(id, "approve");
      assert.ok(decided.ok);
      assert.equal((await publicRow(id)).review_status, "approved");
      const [open] = await sql`SELECT count(*)::int AS n FROM atlas_reports WHERE source_item_id = ${id} AND status = 'open'`;
      assert.equal(open.n, 0);
      // So one more report starts from zero instead of re-escalating at once.
      const one = await report(slug, await user());
      assert.ok(one.ok && !one.escalated);
      assert.equal((await publicRow(id)).review_status, "approved");
    });

    await t.test("a high-risk reason escalates on the first report; dismissed reports do not count", async () => {
      const owner = await user();
      const id = await live(owner);
      const slug = await slugOf(id);
      const first = await report(slug, await user());
      const second = await report(slug, await user());
      assert.ok(first.ok && second.ok);
      const reportIds = await sql<{ id: string }[]>`SELECT id::text FROM atlas_reports WHERE source_item_id = ${id}`;
      for (const r of reportIds) assert.ok((await pub.resolveReport(r.id, "dismissed")).ok);
      const third = await report(slug, await user());
      assert.ok(third.ok && !third.escalated, "two dismissed + one open is under the bar");

      const risky = await report(slug, await user(), "inappropriate");
      assert.ok(risky.ok && risky.escalated);
      assert.equal((await publicRow(id)).review_status, "takedown");
      const [event] = await sql`SELECT actor FROM atlas_moderation_events WHERE item_id = ${id} AND phase = 'report'`;
      assert.equal(event.actor, "report:high-risk");
    });

    await t.test("rejecting a live item takes it off 物見", async () => {
      const owner = await user();
      const id = await live(owner);
      assert.ok((await pub.moderate(id, "reject")).ok);
      assert.equal((await item(id)).review_status, "rejected");
      assert.notEqual((await publicRow(id)).review_status, "approved");
      // Rejected is submittable again, and a clean re-submission is public again.
      const back = await pub.submit(owner, id);
      assert.ok(back.ok && back.published);
      assert.equal((await publicRow(id)).review_status, "approved");
    });

    await t.test("withdraw hides, unlinks and ends sharing; a takedown is final", async () => {
      const owner = await user();
      const id = await live(owner);
      const shared = await pub.shareToSpot(owner, id, "asakusa", true);
      assert.ok(shared.ok && shared.spot.spotShared);
      assert.equal((await publicRow(id)).spot_id, "asakusa");

      const withdrawn = await pub.withdraw(owner, id);
      assert.ok(withdrawn.ok);
      assert.ok(removed.includes(withdrawn.publicPath!));
      const row = await publicRow(id);
      assert.equal(row.review_status, "withdrawn");
      assert.equal(row.spot_id, null);
      assert.equal((await item(id)).spot_shared, false);
      assert.equal((await item(id)).spot_id, "asakusa", "the private tag stays");

      const back = await pub.submit(owner, id);
      assert.ok(back.ok && back.published);
      assert.equal((await publicRow(id)).spot_id, null, "sharing is opted into again, not restored");

      assert.ok((await pub.moderate(id, "takedown")).ok);
      assert.deepEqual(await pub.submit(owner, id), { ok: false, reason: "not_allowed" });
      assert.deepEqual(await pub.withdraw(owner, id), { ok: false, reason: "not_allowed" });
    });

    await t.test("sharing to a 景點 follows its rules", async () => {
      const owner = await user();
      const privateCard = await card(owner);
      assert.deepEqual(await pub.shareToSpot(owner, privateCard, "asakusa", true), { ok: false, reason: "not_public" });
      const tagged = await pub.shareToSpot(owner, privateCard, "asakusa", false);
      assert.ok(tagged.ok && tagged.spot.spotId === "asakusa");
      const english = await card(owner, "en");
      assert.deepEqual(await pub.shareToSpot(owner, english, "asakusa", false), { ok: false, reason: "spot_not_allowed" });
      assert.deepEqual(await pub.shareToSpot(await user(), privateCard, null, false), { ok: false, reason: "not_found" });
    });

    await t.test("「不是在這裡拍的」 never takes a card down; upholding it removes the card from that spot only", async () => {
      const owner = await user();
      const id = await live(owner);
      const slug = await slugOf(id);
      assert.equal((await report(slug, await user(), "not_here")).ok, false, "not offered before it is shared");
      assert.ok((await pub.shareToSpot(owner, id, "asakusa", true)).ok);
      let last = "";
      for (let i = 0; i < 4; i++) {
        const filed = await report(slug, await user(), "not_here");
        assert.ok(filed.ok && !filed.escalated && filed.target === "item_spot");
      }
      [{ id: last }] = await sql<{ id: string }[]>`SELECT id::text FROM atlas_reports WHERE source_item_id = ${id} ORDER BY id DESC LIMIT 1`;
      assert.equal((await publicRow(id)).review_status, "approved");
      assert.deepEqual(await pub.resolveReport(last, "takedown"), { ok: false, reason: "unsupported" });

      assert.ok((await pub.resolveReport(last, "remove_from_spot")).ok);
      const after = await item(id);
      assert.equal(after.review_status, "approved");
      assert.equal(after.spot_share_revoked, "asakusa");
      assert.equal((await publicRow(id)).spot_id, null);
      assert.equal((await publicRow(id)).review_status, "approved");
      assert.deepEqual(await pub.shareToSpot(owner, id, "asakusa", true), { ok: false, reason: "spot_share_blocked" });
      // Another spot is still open to it.
      assert.ok((await pub.shareToSpot(owner, id, "ueno", true)).ok);
      assert.equal((await publicRow(id)).spot_id, "ueno");
    });

    await t.test("a re-confirm that moves the spot moves the public row with it", async () => {
      const owner = await user();
      const id = await live(owner);
      assert.ok((await pub.shareToSpot(owner, id, "asakusa", true)).ok);
      const before = await item(id);
      const jobId = randomUUID(), candidateId = randomUUID();
      await sql`INSERT INTO user_atlas_recognition_jobs (id, user_id, image_id) VALUES (${jobId}, ${owner}, ${before.image_id})`;
      await sql`INSERT INTO user_atlas_candidates (id, user_id, job_id, image_id, level, label, normalized_label, confidence, rank, source)
        VALUES (${candidateId}, ${owner}, ${jobId}, ${before.image_id}, 'primary', 'lantern', 'lantern', 0.9, 0, 'test')`;
      await sql.begin((tx) =>
        saveConfirmedItem(tx, {
          itemId: id, exists: true, userId: owner, imageId: before.image_id, candidateId,
          targetLanguage: "ja", primaryLabel: "lantern",
          names: { lemma: before.lemma, displayZhHant: "燈籠", displayJa: null, displayEn: null, source: "candidate" },
          spotId: "ueno", now: new Date(),
        }),
      );
      assert.equal((await item(id)).spot_id, "ueno");
      assert.equal((await item(id)).spot_shared, false);
      assert.equal((await publicRow(id)).spot_id, null, "a moved spot is not shared until opted in again");
    });

    await t.test("a 合集's publication writes each member's public row, spot included", async () => {
      const owner = await user();
      const a = await card(owner), b = await card(owner);
      screen = approved("thumbs/x.webp");
      for (const id of [a, b]) {
        const out = await pub.submit(owner, id, { deferPublication: true });
        assert.ok(out.ok && out.reviewStatus === "approved" && !out.published);
        await pub.prepareForCollection(id, `${id}/thumb.webp`);
      }
      await sql`UPDATE user_atlas_items SET spot_id = 'asakusa', spot_shared = true WHERE id = ${a}`;
      const collectionId = randomUUID();
      await sql`INSERT INTO atlas_collections (id, owner_user_id, slug, title, target_language, review_status, content_review_approved_at)
        VALUES (${collectionId}, ${owner}, ${"c-" + collectionId.slice(0, 8)}, '淺草', 'ja', 'pending_review', now())`;
      await sql`INSERT INTO atlas_collection_items (collection_id, source_item_id, position) VALUES (${collectionId}, ${a}, 0), (${collectionId}, ${b}, 1)`;

      const collection = await pub.publishCollection(collectionId);
      assert.equal(collection?.review_status, "approved");
      assert.equal((await publicRow(a)).spot_id, "asakusa");
      assert.equal((await publicRow(b)).spot_id, null);
      const members = await sql`SELECT count(*)::int AS n FROM atlas_collection_items WHERE collection_id = ${collectionId} AND public_item_id IS NOT NULL`;
      assert.equal(members[0].n, 2);

      // Only a live 合集 can be withdrawn by its author; its members stay public.
      const withdrawn = await pub.withdrawCollection(collectionId, owner);
      assert.ok(withdrawn.ok);
      assert.equal((await publicRow(a)).review_status, "approved");
      assert.deepEqual(await pub.withdrawCollection(collectionId, owner), { ok: false, reason: "not_allowed" });
    });

    await t.test("a 合集 reports pulled back cannot be withdrawn by its author", async () => {
      const owner = await user();
      const id = await card(owner);
      await pub.submit(owner, id, { deferPublication: true });
      await pub.prepareForCollection(id, `${id}/thumb.webp`);
      const collectionId = randomUUID(), slug = "c-" + collectionId.slice(0, 8);
      await sql`INSERT INTO atlas_collections (id, owner_user_id, slug, title, target_language, review_status, content_review_approved_at)
        VALUES (${collectionId}, ${owner}, ${slug}, '上野', 'ja', 'pending_review', now())`;
      await sql`INSERT INTO atlas_collection_items (collection_id, source_item_id, position) VALUES (${collectionId}, ${id}, 0)`;
      assert.ok(await pub.publishCollection(collectionId));
      const filed = await pub.fileReport({ subject: { type: "collection", slug }, reporterUserId: await user(), reason: "copyright", detail: null });
      assert.ok(filed.ok && filed.escalated);
      assert.deepEqual(await pub.withdrawCollection(collectionId, owner), { ok: false, reason: "not_allowed" });
    });

    await t.test("an author report never escalates, and reporting yourself is a no-op", async () => {
      const author = await user();
      const [{ username }] = await sql`SELECT username FROM profiles WHERE id = ${author}`;
      const filed = await pub.fileReport({ subject: { type: "author", handle: username }, reporterUserId: await user(), reason: "spam", detail: null });
      assert.ok(filed.ok && !filed.already && !filed.escalated);
      const self = await pub.fileReport({ subject: { type: "author", handle: username }, reporterUserId: author, reason: "spam", detail: null });
      assert.ok(self.ok && self.already);
      assert.deepEqual(
        await pub.fileReport({ subject: { type: "author", handle: username }, reporterUserId: await user(), reason: "nope", detail: null }),
        { ok: false, reason: "invalid_reason" },
      );
    });

    await t.test("a restricted author cannot publish or share; a risky photo waits for a human", async () => {
      const owner = await user();
      const id = await card(owner);
      await sql`INSERT INTO user_moderation_state (user_id, state) VALUES (${owner}, 'restricted')`;
      assert.deepEqual(await pub.submit(owner, id), { ok: false, reason: "restricted" });
      await sql`DELETE FROM user_moderation_state WHERE user_id = ${owner}`;

      screen = { ...approved("thumbs/x.webp"), reviewStatus: "pending_review", verdict: "flagged" };
      const flagged = await pub.submit(owner, id);
      assert.ok(flagged.ok && flagged.reviewStatus === "pending_review" && !flagged.published);
      assert.equal(await publicRow(id), undefined);
      screen = approved("thumbs/x.webp");
    });
  } finally {
    await sql.end();
  }
});
