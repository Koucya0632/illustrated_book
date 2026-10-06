import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { createCreditWallet, type CreditAccount, type CreditTransaction } from "../credits/wallet";
import { CreditError } from "../credits/policy";
import { OperationError } from "./contracts";

export const UPLOAD_LIMITS = { count: 20, bytes: 100 * 1024 * 1024, retentionMs: 7 * 86_400_000, leaseMs: 15 * 60_000 } as const;
export interface UploadInput { sha256: string; byteSize: number; width: number; height: number }
export class UploadError extends Error {
  constructor(public readonly code: "upload_busy" | "upload_limit" | "upload_expired" | "invalid_upload") { super(code); }
}
export function createCreditUploads(sql: postgres.Sql, clock = () => new Date()) {
  const wallet = createCreditWallet(sql, clock);
  function transact<T>(a: CreditAccount, run: (s: CreditTransaction) => Promise<T>) {
    return wallet.transact(a, async s => {
      await s.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`atlas-capacity:${a.userId}`}, 0))`;
      return run(s);
    });
  }
  async function load(s: CreditTransaction, a: CreditAccount, id: string) {
    const [row] = await s.sql`SELECT * FROM credit_image_uploads WHERE id = ${id} AND user_id = ${a.userId}
      AND environment = ${a.environment}`;
    if (!row) throw new OperationError("image_not_found");
    return row;
  }
  return {
    begin(a: CreditAccount, input: UploadInput) {
      if (!/^[a-f0-9]{64}$/.test(input.sha256) || !Number.isSafeInteger(input.byteSize) || input.byteSize < 1 ||
          input.byteSize > 9 * 1024 * 1024 || !Number.isSafeInteger(input.width) || !Number.isSafeInteger(input.height) ||
          input.width < 1 || input.height < 1 || input.width > 1600 || input.height > 1600) throw new UploadError("invalid_upload");
      return transact(a, async s => {
        const [permanent] = await s.sql`SELECT id FROM user_lifetime_entitlements WHERE user_id = ${a.userId} AND revoked_at IS NULL LIMIT 1`;
        if (!permanent) throw new CreditError("benefit_ineligible");
        const [existing] = await s.sql`SELECT * FROM user_atlas_images WHERE user_id = ${a.userId}
          AND sha256 = ${input.sha256} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`;
        // Dedup returns only the image. Results are obtained through a language-bound quote.
        if (existing) return { duplicate: true as const, image: existing, upload: null };
        const [busy] = await s.sql`SELECT id FROM credit_image_uploads WHERE user_id = ${a.userId}
          AND sha256 = ${input.sha256} AND state IN ('pending','cleanup')`;
        if (busy) throw new UploadError("upload_busy");
        const [usage] = await s.sql`SELECT
          (SELECT count(*) FROM user_atlas_images i WHERE i.user_id = ${a.userId} AND i.deleted_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM user_atlas_items c WHERE c.image_id = i.id AND c.user_id = ${a.userId} AND c.deleted_at IS NULL)) +
          (SELECT count(*) FROM credit_image_uploads WHERE user_id = ${a.userId} AND state = 'pending') AS count,
          COALESCE((SELECT sum(i.byte_size) FROM user_atlas_images i WHERE i.user_id = ${a.userId} AND i.deleted_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM user_atlas_items c WHERE c.image_id = i.id AND c.user_id = ${a.userId} AND c.deleted_at IS NULL)),0) +
          COALESCE((SELECT sum(byte_size) FROM credit_image_uploads WHERE user_id = ${a.userId} AND state = 'pending'),0) AS bytes`;
        if (Number(usage.count) >= UPLOAD_LIMITS.count || Number(usage.bytes) + input.byteSize > UPLOAD_LIMITS.bytes) throw new UploadError("upload_limit");
        const id = randomUUID(), original = `${a.userId}/${id}/original.webp`, thumb = `${a.userId}/${id}/thumb.webp`;
        const [upload] = await s.sql`INSERT INTO credit_image_uploads
          (id, user_id, environment, sha256, byte_size, width, height, original_path, thumb_path, state, lease_until, expires_at, created_at)
          VALUES (${id}, ${a.userId}, ${a.environment}, ${input.sha256}, ${input.byteSize}, ${input.width}, ${input.height},
            ${original}, ${thumb}, 'pending', ${new Date(s.now.getTime() + UPLOAD_LIMITS.leaseMs)},
            ${new Date(s.now.getTime() + UPLOAD_LIMITS.retentionMs)}, ${s.now}) RETURNING *`;
        return { duplicate: false as const, upload, image: null };
      });
    },
    complete(a: CreditAccount, id: string) {
      return transact(a, async s => {
        const upload = await load(s, a, id);
        if (upload.state === "ready") {
          const [image] = await s.sql`SELECT * FROM user_atlas_images WHERE id = ${id} AND user_id = ${a.userId} AND deleted_at IS NULL`;
          if (!image) throw new UploadError("upload_expired");
          return image;
        }
        if (upload.state !== "pending" || upload.lease_until <= s.now) throw new UploadError("upload_expired");
        const [image] = await s.sql`INSERT INTO user_atlas_images
          (id, user_id, bucket, original_path, thumb_path, recognition_path, mime_type, byte_size, width, height, sha256, updated_at)
          VALUES (${id}, ${a.userId}, 'user-atlas-images', ${upload.original_path}, ${upload.thumb_path}, ${upload.original_path},
            'image/webp', ${upload.byte_size}, ${upload.width}, ${upload.height}, ${upload.sha256}, ${s.now}) RETURNING *`;
        await s.sql`UPDATE credit_image_uploads SET state = 'ready' WHERE id = ${id}`;
        return image;
      });
    },
    cleanup(a: CreditAccount, id: string, failedUpload = false) {
      return transact(a, async s => {
        const u = await load(s, a, id);
        if (u.state === "cleaned") return null;
        if (u.state === "pending" && !failedUpload && u.lease_until > s.now) return null;
        if (u.state === "ready") {
          // A lost completion response is not a failed upload. Never delete its saved image.
          if (failedUpload || u.expires_at > s.now) return null;
          const [inUse] = await s.sql`SELECT EXISTS (SELECT 1 FROM user_atlas_items WHERE image_id = ${id}
            AND user_id = ${a.userId} AND deleted_at IS NULL UNION ALL SELECT 1 FROM ai_operations
            WHERE image_id = ${id} AND user_id = ${a.userId} AND state IN ('reserved','running','reconciling')) AS live`;
          if (inUse.live) return null;
          await s.sql`UPDATE user_atlas_images SET deleted_at = ${s.now}, updated_at = ${s.now} WHERE id = ${id} AND user_id = ${a.userId}`;
        }
        await s.sql`UPDATE credit_image_uploads SET state = 'cleanup' WHERE id = ${id}`;
        return [u.original_path as string, u.thumb_path as string];
      });
    },
    finishCleanup(a: CreditAccount, id: string) {
      return transact(a, async s => {
        await s.sql`UPDATE credit_image_uploads SET state = 'cleaned' WHERE id = ${id} AND user_id = ${a.userId}
          AND environment = ${a.environment} AND state = 'cleanup'`;
      });
    },
    scan(environment: CreditAccount["environment"], limit = 20) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new UploadError("invalid_upload");
      const now = clock();
      return sql`SELECT u.id, u.user_id FROM credit_image_uploads u WHERE u.environment = ${environment}
        AND (u.state = 'cleanup' OR (u.state = 'pending' AND u.lease_until <= ${now}) OR
          (u.state = 'ready' AND u.expires_at <= ${now} AND NOT EXISTS (SELECT 1 FROM user_atlas_items c
            WHERE c.image_id = u.id AND c.user_id = u.user_id AND c.deleted_at IS NULL))) ORDER BY u.created_at LIMIT ${limit}`;
    },
  };
}
export type CreditUploads = ReturnType<typeof createCreditUploads>;
