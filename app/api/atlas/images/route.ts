import { createHash, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { getSettings } from "@/lib/users-db";
import {
  completeAtlasRecognitionJob,
  createAtlasImage,
  createAtlasRecognitionJob,
  failAtlasRecognitionJob,
  findAtlasImageByHash,
  getLatestAtlasRecognitionJob,
  insertAtlasAiUsage,
  listAtlasCandidates,
  listAtlasImages,
  markAtlasRecognitionRunning,
  replaceAtlasCandidates,
  updateAtlasImageStatus,
} from "@/lib/atlas-db";
import { normalizeTargetLanguage, targetLanguageFromDirection } from "@/lib/atlas/normalize";
import { createPrimaryAtlasProvider } from "@/lib/atlas/recognition";
import { enforceAtlasAiLimits } from "@/lib/atlas/entitlement";
import { clientIpHash } from "@/lib/ratelimit";
import {
  ATLAS_PRIVATE_BUCKET,
  atlasImagePaths,
  createAtlasImageSignedUrls,
  uploadAtlasImageBuffers,
} from "@/lib/atlas/storage";
import type { AtlasCandidateRow, AtlasImageRow, AtlasTargetLanguage } from "@/lib/atlas/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 24_000_000;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function maxUploadBytes(): number {
  const raw = Number(process.env.ATLAS_MAX_UPLOAD_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_BYTES;
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function processImage(input: Buffer) {
  const sharp = (await import("sharp")).default;
  const base = sharp(input, { limitInputPixels: MAX_PIXELS }).rotate();

  // Two encodes in parallel; no separate recognition variant — the in-memory
  // original (1600px) is fed straight to the vision provider.
  const [original, thumb] = await Promise.all([
    base
      .clone()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer({ resolveWithObject: true }),
    base
      .clone()
      .resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer(),
  ]);

  return {
    buffers: { original: original.data, thumb },
    width: original.info.width,
    height: original.info.height,
  };
}

async function serializeImage(row: AtlasImageRow) {
  const urls = await createAtlasImageSignedUrls({
    imagePath: row.original_path,
    thumbPath: row.thumb_path,
  });
  return {
    id: row.id,
    status: row.status,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    imageUrl: urls.imageUrl,
    thumbUrl: urls.thumbUrl,
  };
}

// Map a raw candidate row to the API shape, coercing the NUMERIC `confidence`
// (which the pg driver serializes as a string) to a number.
function serializeCandidate(row: AtlasCandidateRow) {
  return {
    id: row.id,
    level: row.level,
    label: row.label,
    normalizedLabel: row.normalized_label,
    zhHant: row.zh_hant,
    confidence: Number(row.confidence),
    rank: row.rank,
  };
}

/// Run the primary vision pass inline (right after upload, on the in-memory
/// bytes) so the client gets candidates in the same round trip. Soft-fails:
/// on any error the image is still usable (status needs_review, empty
/// candidates) and the user can retry / type the name manually.
async function runPrimaryRecognition(
  userId: string,
  image: AtlasImageRow,
  imageBytes: Buffer,
  targetLanguage: AtlasTargetLanguage,
) {
  const provider = createPrimaryAtlasProvider();
  const job = await createAtlasRecognitionJob(userId, image.id, "primary");
  await markAtlasRecognitionRunning(userId, job.id, provider.name, "primary");
  try {
    const result = await provider.recognizePrimary({
      imageBytes,
      mimeType: "image/webp",
      targetLanguage,
    });
    await insertAtlasAiUsage({
      userId,
      jobId: job.id,
      imageId: image.id,
      provider: result.provider,
      model: result.model,
      operation: "primary",
      detailLevel: null,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      imageCount: result.usage?.imageCount,
      estimatedCostUsd: result.usage?.estimatedCostUsd,
      latencyMs: result.usage?.latencyMs,
      success: true,
    });
    const updatedJob = await completeAtlasRecognitionJob(userId, job.id, result);
    const rows = await replaceAtlasCandidates(userId, image.id, job.id, targetLanguage, result);
    await updateAtlasImageStatus(userId, image.id, "needs_review");
    return { job: updatedJob ?? job, candidates: rows.map(serializeCandidate) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "recognition failed";
    await insertAtlasAiUsage({
      userId,
      jobId: job.id,
      imageId: image.id,
      provider: provider.name,
      model: null,
      operation: "primary",
      detailLevel: null,
      success: false,
    }).catch(() => {});
    await failAtlasRecognitionJob(userId, job.id, message).catch(() => {});
    await updateAtlasImageStatus(userId, image.id, "needs_review").catch(() => {});
    return { job, candidates: [] as ReturnType<typeof serializeCandidate>[] };
  }
}

export async function GET(req: Request) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 30)));
  const rows = await listAtlasImages(userId, limit);
  const images = await Promise.all(rows.map(serializeImage));
  return NextResponse.json(
    { images },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(req: Request) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field required" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: `unsupported type: ${file.type || "unknown"}` },
      { status: 415 },
    );
  }

  const maxBytes = maxUploadBytes();
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `file too large (${file.size} > ${maxBytes})` },
      { status: 413 },
    );
  }

  const settings = await getSettings(userId);
  const targetLanguage =
    normalizeTargetLanguage(form.get("targetLanguage")) ??
    targetLanguageFromDirection(settings.learningDirection);

  const input = Buffer.from(await file.arrayBuffer());
  const hash = sha256(input);
  const existing = await findAtlasImageByHash(userId, hash);
  if (existing) {
    const latestJob =
      (await getLatestAtlasRecognitionJob(userId, existing.id)) ??
      (await createAtlasRecognitionJob(userId, existing.id));
    const existingCandidates = await listAtlasCandidates(userId, existing.id);
    return NextResponse.json(
      {
        duplicate: true,
        targetLanguage,
        image: await serializeImage(existing),
        job: {
          id: latestJob.id,
          status: latestJob.status,
          stage: latestJob.stage,
        },
        candidates: existingCandidates.map(serializeCandidate),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  let processed: Awaited<ReturnType<typeof processImage>>;
  try {
    processed = await processImage(input);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "image processing failed" },
      { status: 415 },
    );
  }

  const imageId = randomUUID();
  const paths = atlasImagePaths(userId, imageId);
  try {
    await uploadAtlasImageBuffers(paths, processed.buffers);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "storage upload failed" },
      { status: 500 },
    );
  }

  const image = await createAtlasImage({
    id: imageId,
    userId,
    bucket: ATLAS_PRIVATE_BUCKET,
    originalPath: paths.originalPath,
    thumbPath: paths.thumbPath,
    recognitionPath: paths.recognitionPath,
    mimeType: "image/webp",
    byteSize: file.size,
    width: processed.width,
    height: processed.height,
    sha256: hash,
  });

  // Sign the image URLs and evaluate the AI limits (tier quota + backstops) in
  // parallel.
  const [serializedImage, aiLimit] = await Promise.all([
    serializeImage(image),
    enforceAtlasAiLimits({ userId, ipHash: clientIpHash(req), operation: "primary" }),
  ]);

  // When within limit, recognize inline on the in-memory original (no second
  // round trip, no storage re-download). When rate-limited, soft-skip the AI —
  // the upload still succeeds and the image is kept (status needs_review) so the
  // user can name it manually or retry recognition later, mirroring the
  // AI-failure path. Never fail the upload just because the AI budget is spent.
  let recognized: {
    job: { id: string; status: string; stage: string } | null;
    candidates: ReturnType<typeof serializeCandidate>[];
  };
  if (aiLimit.ok) {
    recognized = await runPrimaryRecognition(
      userId,
      image,
      processed.buffers.original,
      targetLanguage,
    );
  } else {
    await updateAtlasImageStatus(userId, image.id, "needs_review").catch(() => {});
    recognized = { job: null, candidates: [] };
  }

  return NextResponse.json(
    {
      duplicate: false,
      targetLanguage,
      image: serializedImage,
      job: recognized.job
        ? {
            id: recognized.job.id,
            status: recognized.job.status,
            stage: recognized.job.stage,
          }
        : null,
      candidates: recognized.candidates,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
