import { createHash } from "node:crypto";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { getSql } from "@/lib/db";
import { userCreditConfig, CreditError } from "@/lib/credits/policy";
import { createCreditUploads, UploadError } from "@/lib/ai-operations/uploads";
import { uploadFormData } from "@/lib/ai-operations/upload-body";
import { createAtlasImageSignedUrls, removeAtlasPrivateObjects, uploadAtlasImageBuffers } from "@/lib/atlas/storage";
import { hitRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const headers = { "Cache-Control": "private, no-store" };
const mimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserIdFast();
    if (!userId) return Response.json({ error: "unauthorized" }, { status: 401, headers });
    const origin = request.headers.get("origin");
    if (request.headers.get("sec-fetch-site") === "cross-site" || (origin !== null && origin !== new URL(request.url).origin)) {
      return Response.json({ error: "forbidden" }, { status: 403, headers });
    }
    const config = userCreditConfig(userId);
    if (config.mode !== "live" || process.env.AI_CREDITS_OPERATIONS_ENABLED !== "true" ||
        process.env.AI_CREDITS_WORKER_ENABLED !== "true" || !process.env.CRON_SECRET) throw new CreditError("credits_disabled");
    const sql = getSql();
    if (!sql) throw new CreditError("credits_unavailable");
    const account = { userId, environment: config.environment }, service = createCreditUploads(sql);
    const rate = await hitRateLimit({ bucket: `atlas:credits-upload:${userId}`, windowSeconds: 60, limit: 12, failClosed: true });
    if (!rate.available) throw new CreditError("credits_unavailable");
    if (!rate.ok) return Response.json({ error: "rate_limited" }, { status: 429, headers });
    const form = await uploadFormData(request), file = form.get("file");
    if (!(file instanceof File) || !mimeTypes.has(file.type) || file.size < 1 || file.size > 8 * 1024 * 1024 ||
        [...form.keys()].some(key => key !== "file") || form.getAll("file").length !== 1) throw new UploadError("invalid_upload");
    const bytes = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const sharp = (await import("sharp")).default;
    let original, thumb;
    try {
      const base = sharp(bytes, { limitInputPixels: 24_000_000 }).rotate();
      [original, thumb] = await Promise.all([
        base.clone().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 86 }).toBuffer({ resolveWithObject: true }),
        base.clone().resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(),
      ]);
    } catch { throw new UploadError("invalid_upload"); }
    const started = await service.begin(account, { sha256, byteSize: original.data.length + thumb.length,
      width: original.info.width, height: original.info.height });
    let image = started.image;
    if (!started.duplicate) {
      const u = started.upload;
      try {
        await uploadAtlasImageBuffers({ originalPath: u.original_path, thumbPath: u.thumb_path, recognitionPath: u.original_path },
          { original: original.data, thumb });
        image = await service.complete(account, u.id);
      } catch (error) {
        // Persist cleanup first; a lost commit response must not delete a successfully saved image.
        try {
          const paths = await service.cleanup(account, u.id, true);
          if (paths) { await removeAtlasPrivateObjects(paths); await service.finishCleanup(account, u.id); }
        } catch { /* Durable reservation is retried by the cleanup worker. */ }
        throw error;
      }
    }
    if (!image) throw new CreditError("credits_unavailable");
    const urls = await createAtlasImageSignedUrls({ imagePath: image.original_path, thumbPath: image.thumb_path });
    return Response.json({ image: { id: image.id, status: image.status, width: image.width, height: image.height, ...urls },
      duplicate: started.duplicate, pendingRetentionDays: 7 }, { status: started.duplicate ? 200 : 201, headers });
  } catch (error) {
    if (error instanceof UploadError) return Response.json({ error: error.code }, {
      status: error.code === "invalid_upload" ? 400 : 409, headers });
    if (error instanceof CreditError) return Response.json({ error: error.code }, {
      status: error.code === "credits_disabled" ? 404 : ["credits_not_enrolled", "benefit_ineligible"].includes(error.code) ? 403 : 503, headers });
    console.error("[ai-images] upload failed; cleanup remains recoverable");
    return Response.json({ error: "credits_unavailable" }, { status: 503, headers });
  }
}
