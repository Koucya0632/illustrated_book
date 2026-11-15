// The 物見 publication lifecycle: how a 自製圖鑑 item (and a 合集) becomes
// public, stops being public, is reported, and is shared to a 景點.
//
// One module, so each transition's rule lives in one place and every caller —
// the author's routes, the admin queue, the report routes, the capture
// confirm — goes through it. It takes its database handle and its ports
// (storage, the machine gate) instead of reaching for globals, so the
// throwaway-Postgres suite runs it for real (tests/atlas-publication-postgres
// .test.ts); production wiring is lib/atlas/publication-live.ts.
//
// THE RULES (lib/atlas/lifecycle-rules.ts holds the status sets):
//   - The author submits only from draft / rejected / withdrawn and withdraws
//     only what is live. An item reports pulled back waits for a human.
//   - One writer of the public row (`writePublicRow`) and one hider
//     (`hidePublicRow`), so single publish, 合集 publish, withdraw, takedown,
//     reject and report escalation cannot disagree about what that row says.
//   - Each transition re-reads its row `FOR UPDATE` inside its own transaction.
//   - Reports count toward a takedown only while open; a human's decision
//     closes them, so a re-approved item starts from zero.
//   - A card's 景點 reaches the public row only while its owner shares it there
//     and an admin has not taken it off that spot (`sharedSpotOf`).
//
// No "server-only" and no storage / AI import: everything outside the
// database comes in through `PublicationPorts`.

import type postgres from "postgres";
import { canSubmit, canWithdraw, sharedSpotOf } from "./lifecycle-rules";
import { reportReason, TAKEDOWN_REASON_VALUES, type ReportTarget } from "./report-reasons";
import { canShareToSpot, spotForCard, spotShareBlocked } from "../travel/spot-tagging";
import type { AtlasCollectionRow, AtlasItemRow, AtlasModerationVerdict, AtlasPublicItemRow } from "./types";

type Sql = postgres.Sql;
type Tx = postgres.TransactionSql | postgres.Sql;

/** What the machine gate decided about one item (lib/atlas/submit-pipeline.ts). */
export interface ScreenDecision {
  reviewStatus: "approved" | "pending_review" | "rejected";
  verdict: AtlasModerationVerdict;
  categories: string[];
  scores: Record<string, number>;
  degraded: boolean;
  /** The private thumbnail the public image is copied from; null when unreadable. */
  thumbPath: string | null;
}

export interface PublicationPorts {
  screen(item: AtlasItemRow): Promise<ScreenDecision>;
  publishShareImage(input: { publicItemId: string; privateThumbPath: string }): Promise<{ path: string }>;
  removePublicObjects(paths: string[]): Promise<void>;
  /** Reports before a non-high-risk reason escalates. */
  escalateAt: number;
}

export type Refusal =
  | "not_found"
  | "not_allowed"
  | "restricted"
  | "spot_not_allowed"
  | "not_public"
  | "spot_share_blocked"
  | "invalid_reason"
  | "unsupported";

export type Outcome<T extends object = object> = ({ ok: true } & T) | { ok: false; reason: Refusal };

const refuse = (reason: Refusal): { ok: false; reason: Refusal } => ({ ok: false, reason });

export interface SubmitResult {
  item: AtlasItemRow;
  reviewStatus: "approved" | "pending_review" | "rejected";
  published: boolean;
  categories: string[];
}

export interface SpotState {
  spotId: string | null;
  spotShared: boolean;
  spotShareBlocked: boolean;
}

export type ReportSubject =
  | { type: "item"; slug: string }
  | { type: "collection"; slug: string }
  | { type: "author"; handle: string };

export interface FiledReport {
  already: boolean;
  escalated: boolean;
  /** What the moderation notice names: the lemma, the 合集 title or the handle. */
  name: string;
  slug: string;
  target: ReportTarget;
  spotId: string | null;
}

export type ReportResolution = "reviewed" | "dismissed" | "takedown" | "remove_from_spot";

function slugifyAtlas(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "atlas";
}

function spotState(item: AtlasItemRow): SpotState {
  const spotId = item.spot_id ?? null;
  return {
    spotId,
    spotShared: item.spot_shared ?? false,
    spotShareBlocked: spotShareBlocked({ spot_id: spotId, spot_share_revoked: item.spot_share_revoked ?? null }),
  };
}

/**
 * Re-point the public row at the item's shared 景點 (or at none). Exported for
 * the capture confirm, which can move an item's spot inside its own
 * transaction (lib/atlas/item-writes.ts).
 */
export async function mirrorPublicSpot(tx: Tx, itemId: string): Promise<void> {
  await tx`
    UPDATE atlas_public_items pi
    SET spot_id = CASE
          WHEN i.spot_shared AND i.spot_id IS NOT NULL
               AND i.spot_share_revoked IS DISTINCT FROM i.spot_id THEN i.spot_id
          ELSE NULL END,
        updated_at = now()
    FROM user_atlas_items i
    WHERE pi.source_item_id = i.id
      AND i.id = ${itemId}::uuid
      AND pi.spot_id IS DISTINCT FROM (CASE
          WHEN i.spot_shared AND i.spot_id IS NOT NULL
               AND i.spot_share_revoked IS DISTINCT FROM i.spot_id THEN i.spot_id
          ELSE NULL END)
  `;
}

/** Hide an item's public row. Returns the public image path it had. */
async function hidePublicRow(
  tx: Tx,
  itemId: string,
  options: { status: "withdrawn" | "takedown"; clearImage: boolean; clearSpot: boolean },
): Promise<string | null> {
  const [before] = await tx<{ image_public_path: string | null }[]>`
    SELECT image_public_path FROM atlas_public_items WHERE source_item_id = ${itemId}::uuid LIMIT 1
  `;
  await tx`
    UPDATE atlas_public_items
    SET review_status = ${options.status},
        image_public_path = CASE WHEN ${options.clearImage} THEN NULL ELSE image_public_path END,
        spot_id = CASE WHEN ${options.clearSpot} THEN NULL ELSE spot_id END,
        updated_at = now()
    WHERE source_item_id = ${itemId}::uuid
  `;
  return before?.image_public_path ?? null;
}

/**
 * Write (or rewrite) the item's public row as approved. The one writer: single
 * publish, admin approval and 合集 publication all come through here, so the
 * row always carries the same columns — including its shared 景點.
 */
async function writePublicRow(tx: Tx, item: AtlasItemRow, imagePublicPath: string | null): Promise<AtlasPublicItemRow> {
  const slug = item.public_slug ?? `${slugifyAtlas(item.lemma)}-${item.id.slice(0, 8)}`;
  const [row] = await tx<AtlasPublicItemRow[]>`
    INSERT INTO atlas_public_items (
      source_item_id, owner_user_id, public_slug, lemma, display_zh_hant,
      target_language, category, image_public_path, spot_id,
      review_status, published_at, updated_at
    )
    VALUES (
      ${item.id}::uuid, ${item.user_id}::uuid, ${slug}, ${item.lemma}, ${item.display_zh_hant},
      ${item.target_language}, ${item.category}, ${imagePublicPath}, ${sharedSpotOf(item)},
      'approved', now(), now()
    )
    ON CONFLICT (public_slug) DO UPDATE SET
      lemma = EXCLUDED.lemma,
      display_zh_hant = EXCLUDED.display_zh_hant,
      target_language = EXCLUDED.target_language,
      category = EXCLUDED.category,
      image_public_path = EXCLUDED.image_public_path,
      spot_id = EXCLUDED.spot_id,
      review_status = 'approved',
      updated_at = now()
    RETURNING *
  `;
  await tx`
    UPDATE user_atlas_items
    SET visibility = 'public',
        review_status = 'approved',
        published_at = COALESCE(published_at, now()),
        public_slug = ${slug},
        share_image_path = ${imagePublicPath},
        cdn_cache_key = ${slug},
        updated_at = now()
    WHERE id = ${item.id}::uuid
  `;
  // A 合集 member that was waiting for this row joins its collections now.
  await tx`
    UPDATE atlas_collection_items
    SET public_item_id = ${row.id}::uuid
    WHERE source_item_id = ${item.id}::uuid
      AND public_item_id IS NULL
  `;
  return row;
}

async function recordEvent(
  sql: Tx,
  input: { itemId: string; phase: string; verdict: string; categories: string[]; scores: Record<string, number>; actor: string },
): Promise<void> {
  try {
    await sql`
      INSERT INTO atlas_moderation_events (item_id, phase, verdict, categories, scores, actor)
      VALUES (${input.itemId}::uuid, ${input.phase}, ${input.verdict},
        ${JSON.stringify(input.categories)}::jsonb, ${JSON.stringify(input.scores)}::jsonb, ${input.actor})
    `;
  } catch {
    // The audit trail must never break a transition.
  }
}

/** Close the open reports against an item once a human has decided it. */
async function closeItemReports(tx: Tx, itemId: string): Promise<void> {
  await tx`
    UPDATE atlas_reports SET status = 'reviewed'
    WHERE source_item_id = ${itemId}::uuid AND target_type = 'item' AND status = 'open'
  `;
}

async function setReviewStatusIf(sql: Tx, itemId: string, from: string, to: string): Promise<void> {
  await sql`
    UPDATE user_atlas_items SET review_status = ${to}, updated_at = now()
    WHERE id = ${itemId}::uuid AND review_status = ${from} AND deleted_at IS NULL
  `;
}

export function createAtlasPublication(sql: Sql, ports: PublicationPorts) {
  /** Author standing: restricted and banned accounts may not publish. Fails open, as before. */
  async function isAuthorRestricted(userId: string): Promise<boolean> {
    try {
      const [row] = await sql<{ state: string }[]>`
        SELECT state FROM user_moderation_state WHERE user_id = ${userId}::uuid LIMIT 1
      `;
      return row?.state === "restricted" || row?.state === "banned";
    } catch {
      return false;
    }
  }

  async function itemWithThumb(itemId: string): Promise<(AtlasItemRow & { thumb_path: string | null }) | null> {
    const [row] = await sql<(AtlasItemRow & { thumb_path: string | null })[]>`
      SELECT i.*, img.thumb_path
      FROM user_atlas_items i
      LEFT JOIN user_atlas_images img ON img.id = i.image_id AND img.deleted_at IS NULL
      WHERE i.id = ${itemId}::uuid AND i.deleted_at IS NULL
      LIMIT 1
    `;
    return row ?? null;
  }

  async function approve(itemId: string, imagePublicPath: string | null): Promise<AtlasPublicItemRow | null> {
    return sql.begin(async (tx) => {
      const [item] = await tx<AtlasItemRow[]>`
        SELECT * FROM user_atlas_items WHERE id = ${itemId}::uuid AND deleted_at IS NULL FOR UPDATE
      `;
      if (!item || item.review_status === "takedown") return null;
      return writePublicRow(tx, item, imagePublicPath);
    }) as Promise<AtlasPublicItemRow | null>;
  }

  /** Approved item, public image prepared, exposed only when its 合集 goes live. */
  async function prepareForCollection(itemId: string, imagePublicPath: string): Promise<void> {
    await sql`
      UPDATE user_atlas_items
      SET visibility = 'private', review_status = 'approved',
          public_slug = COALESCE(public_slug, 'atlas-' || left(id::text, 8)),
          share_image_path = ${imagePublicPath}, updated_at = now()
      WHERE id = ${itemId}::uuid AND deleted_at IS NULL AND review_status <> 'takedown'
    `;
  }

  /**
   * The 合集's final gate: every member is already public or approved with a
   * prepared image, and the set goes live in one transaction.
   */
  async function publishCollection(id: string): Promise<AtlasCollectionRow | null> {
    return sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${id}::text, 0::bigint))`;
      const [collectionGate] = await tx<{ content_ready: boolean }[]>`
        SELECT (content_review_approved_at IS NOT NULL) AS content_ready
        FROM atlas_collections
        WHERE id = ${id}::uuid AND review_status <> 'takedown'
        FOR UPDATE
      `;
      if (!collectionGate?.content_ready) return null;
      const [gate] = await tx<{ item_count: number; blocked_count: number }[]>`
        SELECT count(*)::int AS item_count,
               count(*) FILTER (
                 WHERE i.deleted_at IS NOT NULL
                    OR img.deleted_at IS NOT NULL
                    OR img.status NOT IN ('confirmed', 'cards_ready')
                    OR i.review_status IN ('rejected', 'takedown')
                    OR (pi.id IS NULL
                      AND (i.review_status <> 'approved' OR i.share_image_path IS NULL))
               )::int AS blocked_count
        FROM atlas_collection_items ci
        JOIN user_atlas_items i ON i.id = ci.source_item_id
        JOIN user_atlas_images img ON img.id = i.image_id
        LEFT JOIN atlas_public_items pi
          ON pi.source_item_id = i.id AND pi.review_status = 'approved'
        WHERE ci.collection_id = ${id}::uuid
      `;
      if (!gate || gate.item_count === 0 || gate.blocked_count > 0) return null;

      const members = await tx<AtlasItemRow[]>`
        SELECT i.* FROM atlas_collection_items ci
        JOIN user_atlas_items i ON i.id = ci.source_item_id
        WHERE ci.collection_id = ${id}::uuid
        ORDER BY ci.position
        FOR UPDATE OF i
      `;
      for (const member of members) await writePublicRow(tx, member, member.share_image_path);

      const rows = await tx<AtlasCollectionRow[]>`
        UPDATE atlas_collections
        SET review_status = 'approved', published_at = COALESCE(published_at, now()), updated_at = now()
        WHERE id = ${id}::uuid AND content_review_approved_at IS NOT NULL
        RETURNING *
      `;
      return rows[0] ?? null;
    }) as Promise<AtlasCollectionRow | null>;
  }

  async function pendingCollectionIdsForItem(itemId: string): Promise<string[]> {
    const rows = await sql<{ id: string }[]>`
      SELECT DISTINCT c.id
      FROM atlas_collection_items ci
      JOIN atlas_collections c ON c.id = ci.collection_id
      WHERE ci.source_item_id = ${itemId}::uuid AND c.review_status = 'pending_review'
    `;
    return rows.map((r) => r.id);
  }

  async function takedownItem(itemId: string): Promise<boolean> {
    return sql.begin(async (tx) => {
      const [item] = await tx<{ id: string }[]>`
        UPDATE user_atlas_items
        SET review_status = 'takedown', visibility = 'private', spot_shared = false, updated_at = now()
        WHERE id = ${itemId}::uuid
        RETURNING id
      `;
      if (!item) return false;
      await hidePublicRow(tx, itemId, { status: "takedown", clearImage: false, clearSpot: true });
      await closeItemReports(tx, itemId);
      return true;
    }) as Promise<boolean>;
  }

  async function setCollectionStatus(id: string, status: "rejected" | "takedown"): Promise<AtlasCollectionRow | null> {
    const rows = await sql<AtlasCollectionRow[]>`
      UPDATE atlas_collections
      SET review_status = ${status}, content_review_approved_at = NULL, updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING *
    `;
    return rows[0] ?? null;
  }

  return {
    isAuthorRestricted,
    publishCollection,

    /**
     * Hand the author's item to the machine gate. A clean verdict publishes it
     * now (or, with `deferPublication`, approves it for its 合集 to publish);
     * a risky one waits for a human. Never leaves an item half-published: a
     * failed copy after a clean verdict parks it for a human.
     */
    async submit(
      userId: string,
      itemId: string,
      options: { deferPublication?: boolean } = {},
    ): Promise<Outcome<SubmitResult>> {
      if (await isAuthorRestricted(userId)) return refuse("restricted");
      const submitted = await sql.begin(async (tx) => {
        const [item] = await tx<AtlasItemRow[]>`
          SELECT * FROM user_atlas_items
          WHERE id = ${itemId}::uuid AND user_id = ${userId}::uuid AND deleted_at IS NULL
          FOR UPDATE
        `;
        if (!item) return refuse("not_found");
        if (!canSubmit(item.review_status)) return refuse("not_allowed");
        const slug = `${slugifyAtlas(item.lemma)}-${item.id.slice(0, 8)}`;
        const [row] = await tx<AtlasItemRow[]>`
          UPDATE user_atlas_items
          SET visibility = ${options.deferPublication ? "private" : "public"},
              review_status = 'pending_auto',
              public_slug = COALESCE(public_slug, ${slug}),
              updated_at = now()
          WHERE id = ${itemId}::uuid
          RETURNING *
        `;
        return { ok: true as const, item: row };
      });
      if (!submitted.ok) return submitted;
      const item = submitted.item;

      let decision: ScreenDecision;
      try {
        decision = await ports.screen(item);
      } catch {
        decision = { reviewStatus: "pending_review", verdict: "flagged", categories: [], scores: {}, degraded: true, thumbPath: null };
      }
      await recordEvent(sql, {
        itemId: item.id, phase: "auto", verdict: decision.verdict, categories: decision.categories,
        scores: decision.scores, actor: decision.degraded ? "auto:degraded" : "auto",
      });
      const categories = decision.categories;

      if (decision.reviewStatus !== "approved") {
        await setReviewStatusIf(sql, item.id, "pending_auto", decision.reviewStatus);
        return { ok: true, item, reviewStatus: decision.reviewStatus, published: false, categories };
      }
      if (options.deferPublication) {
        await setReviewStatusIf(sql, item.id, "pending_auto", "approved");
        return { ok: true, item, reviewStatus: "approved", published: false, categories };
      }
      try {
        if (!decision.thumbPath) throw new Error("missing thumb");
        const image = await ports.publishShareImage({
          publicItemId: item.public_slug ?? item.id,
          privateThumbPath: decision.thumbPath,
        });
        const row = await approve(item.id, image.path);
        if (!row) throw new Error("not approvable");
        return { ok: true, item, reviewStatus: "approved", published: true, categories };
      } catch {
        await setReviewStatusIf(sql, item.id, "pending_auto", "pending_review");
        return { ok: true, item, reviewStatus: "pending_review", published: false, categories };
      }
    },

    /**
     * 取消公開: the author takes their live item off 物見. Reversible and
     * unrecorded; savers keep their rows. Ends sharing to a 景點 — a card made
     * public again is opted in again.
     */
    async withdraw(userId: string, itemId: string): Promise<Outcome<{ publicPath: string | null }>> {
      const result = await sql.begin(async (tx) => {
        const [item] = await tx<AtlasItemRow[]>`
          SELECT * FROM user_atlas_items
          WHERE id = ${itemId}::uuid AND user_id = ${userId}::uuid AND deleted_at IS NULL
          FOR UPDATE
        `;
        if (!item) return refuse("not_found");
        if (!canWithdraw(item.review_status)) return refuse("not_allowed");
        const publicPath = await hidePublicRow(tx, itemId, { status: "withdrawn", clearImage: true, clearSpot: true });
        await tx`
          UPDATE user_atlas_items
          SET review_status = 'withdrawn', visibility = 'private', spot_shared = false, updated_at = now()
          WHERE id = ${itemId}::uuid
        `;
        return { ok: true as const, publicPath };
      });
      if (result.ok && result.publicPath) {
        // After the commit: an orphaned object is better than a still-public item.
        await ports.removePublicObjects([result.publicPath]).catch(() => {});
      }
      return result;
    },

    /** A human's decision on an item, from the admin queue. */
    async moderate(
      itemId: string,
      action: "approve" | "reject" | "takedown",
    ): Promise<Outcome<{ publicItem?: AtlasPublicItemRow; deferredToCollections?: string[] }>> {
      if (action === "takedown") return (await takedownItem(itemId)) ? { ok: true } : refuse("not_found");

      if (action === "reject") {
        return sql.begin(async (tx) => {
          const [item] = await tx<{ id: string }[]>`
            UPDATE user_atlas_items
            SET review_status = 'rejected', visibility = 'private', spot_shared = false, updated_at = now()
            WHERE id = ${itemId}::uuid AND deleted_at IS NULL AND review_status <> 'takedown'
            RETURNING id
          `;
          if (!item) return refuse("not_found");
          // A rejected item must not stay on 物見 through a row approved earlier.
          await hidePublicRow(tx, itemId, { status: "takedown", clearImage: false, clearSpot: true });
          await closeItemReports(tx, itemId);
          return { ok: true as const };
        });
      }

      const item = await itemWithThumb(itemId);
      if (!item || item.review_status === "takedown") return refuse("not_found");
      if (!item.thumb_path) return refuse("not_allowed");
      const image = await ports.publishShareImage({
        publicItemId: item.public_slug ?? item.id,
        privateThumbPath: item.thumb_path,
      });
      const pending = await pendingCollectionIdsForItem(item.id);
      if (pending.length > 0) {
        await prepareForCollection(item.id, image.path);
        const published: string[] = [];
        for (const id of pending) {
          const row = await publishCollection(id);
          if (row) published.push(row.id);
        }
        await closeItemReports(sql, item.id);
        return { ok: true, deferredToCollections: published };
      }
      const publicItem = await approve(item.id, image.path);
      if (!publicItem) return refuse("not_found");
      await closeItemReports(sql, item.id);
      return { ok: true, publicItem };
    },

    /** Prepare an approved member's public image for its 合集's publication. */
    prepareForCollection,

    /** 選景點 / 放到景點頁 on the card page; `spotId` null takes the tag off. */
    async shareToSpot(
      userId: string,
      itemId: string,
      spotId: string | null,
      shared: boolean,
    ): Promise<Outcome<{ spot: SpotState }>> {
      if (shared && (await isAuthorRestricted(userId))) return refuse("restricted");
      return sql.begin(async (tx) => {
        const [item] = await tx<AtlasItemRow[]>`
          SELECT * FROM user_atlas_items
          WHERE id = ${itemId}::uuid AND user_id = ${userId}::uuid AND deleted_at IS NULL
          FOR UPDATE
        `;
        if (!item) return refuse("not_found");
        let nextSpot: string | null = null;
        if (spotId !== null) {
          const spot = spotForCard(spotId, item.target_language);
          if (!spot) return refuse("spot_not_allowed");
          nextSpot = spot.id;
          if (shared) {
            const after = {
              visibility: item.visibility, review_status: item.review_status,
              spot_id: spot.id, spot_share_revoked: item.spot_share_revoked ?? null,
            };
            if (!canShareToSpot(after)) return refuse(spotShareBlocked(after) ? "spot_share_blocked" : "not_public");
          }
        }
        const [saved] = await tx<AtlasItemRow[]>`
          UPDATE user_atlas_items
          SET spot_id = ${nextSpot}, spot_shared = ${nextSpot !== null && shared}, updated_at = now()
          WHERE id = ${itemId}::uuid
          RETURNING *
        `;
        await mirrorPublicSpot(tx, itemId);
        return { ok: true as const, spot: spotState(saved) };
      });
    },

    /**
     * File a 檢舉 and apply its consequences. One report per (target,
     * reporter); a repeat is `already`. An item or 合集 crossing the bar is
     * pulled back for a human and hidden meanwhile; an author identity never
     * is, and 「不是在這裡拍的」 never counts toward it.
     */
    async fileReport(input: {
      subject: ReportSubject;
      reporterUserId: string;
      reason: string;
      detail: string | null;
    }): Promise<Outcome<FiledReport>> {
      const spec = reportReason(input.reason);
      if (!spec) return refuse("invalid_reason");
      const { subject } = input;

      if (subject.type === "item") {
        const [item] = await sql<(AtlasPublicItemRow & { source_item_id: string })[]>`
          SELECT * FROM atlas_public_items WHERE public_slug = ${subject.slug} AND review_status = 'approved' LIMIT 1
        `;
        if (!item) return refuse("not_found");
        const target: ReportTarget = spec.offeredFor.includes("item_spot" as never) ? "item_spot" : "item";
        if (target === "item_spot" ? !item.spot_id : !(spec.offeredFor as readonly string[]).includes("item")) {
          return refuse("invalid_reason");
        }
        return sql.begin(async (tx) => {
          const inserted = await tx<{ id: string }[]>`
            INSERT INTO atlas_reports (target_type, target_id, public_item_id, source_item_id, slug, reporter_user_id, reason, detail)
            VALUES (${target}, ${item.id}::uuid, ${item.id}::uuid, ${item.source_item_id}::uuid, ${item.public_slug},
              ${input.reporterUserId}::uuid, ${spec.value}, ${input.detail})
            ON CONFLICT (target_type, target_id, reporter_user_id) DO NOTHING
            RETURNING id
          `;
          const base = { name: item.lemma, slug: item.public_slug, target, spotId: item.spot_id ?? null };
          if (inserted.length === 0) return { ok: true as const, already: true, escalated: false, ...base };
          if (!spec.countsTowardTakedown) return { ok: true as const, already: false, escalated: false, ...base };

          let escalate = spec.highRisk;
          if (!escalate) {
            const [count] = await tx<{ n: number }[]>`
              SELECT count(*)::int AS n FROM atlas_reports
              WHERE public_item_id = ${item.id}::uuid AND target_type = 'item' AND status = 'open'
                AND reason IN ${tx(TAKEDOWN_REASON_VALUES as string[])}
            `;
            escalate = (count?.n ?? 0) >= ports.escalateAt;
          }
          if (!escalate) return { ok: true as const, already: false, escalated: false, ...base };
          const pulled = await tx<{ id: string }[]>`
            UPDATE user_atlas_items SET review_status = 'pending_review', updated_at = now()
            WHERE id = ${item.source_item_id}::uuid AND review_status = 'approved' AND deleted_at IS NULL
            RETURNING id
          `;
          if (pulled.length === 0) return { ok: true as const, already: false, escalated: false, ...base };
          await hidePublicRow(tx, item.source_item_id, { status: "takedown", clearImage: false, clearSpot: false });
          await recordEvent(tx, {
            itemId: item.source_item_id, phase: "report", verdict: "flagged", categories: [spec.value], scores: {},
            actor: spec.highRisk ? "report:high-risk" : "report:threshold",
          });
          return { ok: true as const, already: false, escalated: true, ...base };
        });
      }

      if (subject.type === "collection") {
        if (!(spec.offeredFor as readonly string[]).includes("collection")) return refuse("invalid_reason");
        const [collection] = await sql<{ id: string; title: string }[]>`
          SELECT id, title FROM atlas_collections WHERE slug = ${subject.slug} AND review_status = 'approved' LIMIT 1
        `;
        if (!collection) return refuse("not_found");
        return sql.begin(async (tx) => {
          const inserted = await tx<{ id: string }[]>`
            INSERT INTO atlas_reports (target_type, target_id, slug, reporter_user_id, reason, detail)
            VALUES ('collection', ${collection.id}::uuid, ${subject.slug}, ${input.reporterUserId}::uuid, ${spec.value}, ${input.detail})
            ON CONFLICT (target_type, target_id, reporter_user_id) DO NOTHING
            RETURNING id
          `;
          const base = { name: collection.title, slug: subject.slug, target: "collection" as const, spotId: null };
          if (inserted.length === 0) return { ok: true as const, already: true, escalated: false, ...base };
          let escalate = spec.highRisk;
          if (!escalate) {
            const [count] = await tx<{ n: number }[]>`
              SELECT count(*)::int AS n FROM atlas_reports
              WHERE target_type = 'collection' AND target_id = ${collection.id}::uuid AND status = 'open'
                AND reason IN ${tx(TAKEDOWN_REASON_VALUES as string[])}
            `;
            escalate = (count?.n ?? 0) >= ports.escalateAt;
          }
          if (!escalate) return { ok: true as const, already: false, escalated: false, ...base };
          const pulled = await tx<{ id: string }[]>`
            UPDATE atlas_collections SET review_status = 'pending_review', updated_at = now()
            WHERE id = ${collection.id}::uuid AND review_status = 'approved'
            RETURNING id
          `;
          return { ok: true as const, already: false, escalated: pulled.length > 0, ...base };
        });
      }

      if (!(spec.offeredFor as readonly string[]).includes("author")) return refuse("invalid_reason");
      const [author] = await sql<{ id: string }[]>`SELECT id FROM profiles WHERE username = ${subject.handle} LIMIT 1`;
      if (!author) return refuse("not_found");
      const base = { name: subject.handle, slug: subject.handle, target: "author" as const, spotId: null, escalated: false };
      // Reporting yourself is a no-op, not an error worth explaining.
      if (author.id === input.reporterUserId) return { ok: true, already: true, ...base };
      const inserted = await sql<{ id: string }[]>`
        INSERT INTO atlas_reports (target_type, target_id, slug, reporter_user_id, reason, detail)
        VALUES ('author', ${author.id}::uuid, ${subject.handle}, ${input.reporterUserId}::uuid, ${spec.value}, ${input.detail})
        ON CONFLICT (target_type, target_id, reporter_user_id) DO NOTHING
        RETURNING id
      `;
      // There is deliberately no automatic consequence for an author identity:
      // hiding a person is not the same act as hiding one thing they made.
      return { ok: true, already: inserted.length === 0, ...base };
    },

    /**
     * The admin queue's decision on one report. `takedown` removes the item or
     * 合集 it points at and closes the other open reports on it;
     * `remove_from_spot` upholds a 「不是在這裡拍的」 — the card leaves that 景點
     * for good and stays on 物見.
     */
    async resolveReport(reportId: string, action: ReportResolution): Promise<Outcome> {
      const [report] = await sql<{ target_type: ReportTarget; target_id: string | null; source_item_id: string | null }[]>`
        SELECT target_type, target_id, source_item_id FROM atlas_reports WHERE id = ${reportId}::bigint
      `;
      if (!report) return refuse("not_found");

      if (action === "reviewed" || action === "dismissed") {
        await sql`UPDATE atlas_reports SET status = ${action} WHERE id = ${reportId}::bigint`;
        return { ok: true };
      }

      if (action === "remove_from_spot") {
        if (report.target_type !== "item_spot") return refuse("unsupported");
        if (!report.source_item_id) return refuse("not_found");
        const sourceItemId = report.source_item_id;
        await sql.begin(async (tx) => {
          await tx`
            UPDATE user_atlas_items
            SET spot_share_revoked = spot_id, spot_shared = false, updated_at = now()
            WHERE id = ${sourceItemId}::uuid AND spot_id IS NOT NULL
          `;
          await mirrorPublicSpot(tx, sourceItemId);
          await tx`
            UPDATE atlas_reports SET status = 'reviewed'
            WHERE target_type = 'item_spot' AND source_item_id = ${sourceItemId}::uuid AND status = 'open'
          `;
        });
        return { ok: true };
      }

      // takedown
      if (report.target_type === "item") {
        if (!report.source_item_id || !(await takedownItem(report.source_item_id))) return refuse("not_found");
      } else if (report.target_type === "collection") {
        if (!report.target_id || !(await setCollectionStatus(report.target_id, "takedown"))) return refuse("not_found");
      } else {
        return refuse("unsupported");
      }
      if (report.target_id) {
        await sql`
          UPDATE atlas_reports SET status = 'reviewed'
          WHERE target_type = ${report.target_type} AND target_id = ${report.target_id}::uuid AND status = 'open'
        `;
      }
      await sql`UPDATE atlas_reports SET status = 'reviewed' WHERE id = ${reportId}::bigint`;
      return { ok: true };
    },

    /** A human's decision on a 合集 (approve publishes it if every member is ready). */
    async moderateCollection(
      id: string,
      action: "approve" | "reject" | "takedown",
    ): Promise<Outcome<{ collection: AtlasCollectionRow | null; pendingMembers?: boolean }>> {
      if (action !== "approve") {
        const collection = await setCollectionStatus(id, action === "reject" ? "rejected" : "takedown");
        if (!collection) return refuse("not_found");
        await sql`
          UPDATE atlas_reports SET status = 'reviewed'
          WHERE target_type = 'collection' AND target_id = ${id}::uuid AND status = 'open'
        `;
        return { ok: true, collection };
      }
      const [marked] = await sql<{ id: string }[]>`
        UPDATE atlas_collections
        SET content_review_approved_at = now(), review_status = 'pending_review', updated_at = now()
        WHERE id = ${id}::uuid AND review_status <> 'takedown'
        RETURNING id
      `;
      if (!marked) return refuse("not_found");
      const collection = await publishCollection(id);
      if (!collection) return { ok: true, collection: null, pendingMembers: true };
      await sql`
        UPDATE atlas_reports SET status = 'reviewed'
        WHERE target_type = 'collection' AND target_id = ${id}::uuid AND status = 'open'
      `;
      return { ok: true, collection };
    },

    /** The author unpublishing their own live 合集; members stay public in their own right. */
    async withdrawCollection(id: string, ownerUserId: string): Promise<Outcome<{ collection: AtlasCollectionRow }>> {
      const rows = await sql<AtlasCollectionRow[]>`
        UPDATE atlas_collections
        SET review_status = 'withdrawn', updated_at = now()
        WHERE id = ${id}::uuid AND owner_user_id = ${ownerUserId}::uuid AND review_status = 'approved'
        RETURNING *
      `;
      if (rows[0]) return { ok: true, collection: rows[0] };
      const [exists] = await sql<{ id: string }[]>`
        SELECT id FROM atlas_collections WHERE id = ${id}::uuid AND owner_user_id = ${ownerUserId}::uuid
      `;
      return refuse(exists ? "not_allowed" : "not_found");
    },
  };
}

export type AtlasPublication = ReturnType<typeof createAtlasPublication>;
