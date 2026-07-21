import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { getSettings } from "@/lib/users-db";
import {
  completeAtlasRecognitionJob,
  createAtlasRecognitionJob,
  failAtlasRecognitionJob,
  getAtlasImage,
  insertAtlasAiUsage,
  markAtlasRecognitionRunning,
  replaceAtlasCandidates,
  updateAtlasImageStatus,
} from "@/lib/atlas-db";
import { targetLanguageFromDirection } from "@/lib/atlas/normalize";
import { readLang, readLearningDirection } from "@/lib/cache-headers";
import {
  createEscalateAtlasProvider,
  createPrimaryAtlasProvider,
} from "@/lib/atlas/recognition";
import { downloadAtlasObject } from "@/lib/atlas/storage";
import type { AtlasRecognitionStage } from "@/lib/atlas/types";
import { enforceAtlasAiLimits } from "@/lib/atlas/entitlement";
import { clientIpHash } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function invalidId(id: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: { mode?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const image = await getAtlasImage(userId, params.id);
  if (!image) return NextResponse.json({ error: "not found" }, { status: 404 });

  // This route always spends an AI call (unlike upload, there is no dedup path),
  // so guard it before creating a job. 高精度 (escalate) draws the precision
  // quota; everything else the ordinary monthly limit. The image is left intact
  // either way. `upgradeable` (Free hitting a Pro-only wall) → 402 (paywall);
  // an already-maxed tier or a transient backstop → 429 (message).
  const operation = body.mode === "escalate" ? "precision" : "primary";
  const aiLimit = await enforceAtlasAiLimits({
    userId,
    ipHash: clientIpHash(req),
    operation,
  });
  if (!aiLimit.ok) {
    if (aiLimit.upgradeable) {
      return NextResponse.json(
        { error: "quota_exceeded", scope: aiLimit.scope, message: aiLimit.message },
        { status: 402 },
      );
    }
    return NextResponse.json(
      { error: "rate_limited", scope: aiLimit.scope, message: aiLimit.message },
      {
        status: 429,
        headers: { "Retry-After": String(aiLimit.retryAfterSeconds ?? 60) },
      },
    );
  }

  const mode = body.mode === "escalate" ? "escalate" : "primary";
  const stage: AtlasRecognitionStage = mode === "escalate" ? "escalated" : "primary";
  const provider =
    stage === "primary"
      ? createPrimaryAtlasProvider(aiLimit.tier)
      : createEscalateAtlasProvider();
  const job = await createAtlasRecognitionJob(userId, image.id, stage);

  await Promise.all([
    updateAtlasImageStatus(userId, image.id, "processing"),
    markAtlasRecognitionRunning(userId, job.id, provider.name, stage),
  ]);

  try {
    const settingsPromise = getSettings(userId);
    // Only the 1600px display image is stored. The model needs at most ~1024px
    // (detail=low is resized to 512px provider-side anyway, and 1024px keeps
    // detail=high to fewer tiles), so downscale before base64-encoding to cut
    // payload and input tokens. Soft-fails to the stored bytes.
    let imageBytes = await downloadAtlasObject(image.original_path);
    try {
      const sharp = (await import("sharp")).default;
      imageBytes = await sharp(imageBytes)
        .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      // send the stored image as-is
    }
    const settings = await settingsPromise;
    // Take the language + learning direction from the request, falling back to
    // the stored settings. The client's debounced settings save may not have
    // landed yet (a just-switched uiLang), and glossLanguage must match what
    // the user actually sees or the meaning field comes back empty.
    const uiLang = readLang(req, settings.uiLang);
    const targetLanguage = targetLanguageFromDirection(
      readLearningDirection(req, settings.learningDirection),
    );
    const input = {
      imageBytes,
      mimeType: image.mime_type,
      targetLanguage,
      // ja/en interfaces get candidate glosses in their own language; Chinese
      // UIs read zhHant, and UI==target needs none (the label is the gloss).
      glossLanguage:
        (uiLang === "ja" || uiLang === "en") && uiLang !== targetLanguage
          ? uiLang
          : null,
    };
    const result =
      stage === "primary"
        ? await provider.recognizePrimary(input)
        : provider.recognizeEscalated
        ? await provider.recognizeEscalated(input)
        : await provider.recognizePrimary(input);
    (result as unknown as Record<string, unknown>).__diag = {
      inputGloss: input.glossLanguage,
      inputTarget: input.targetLanguage,
      stage,
      providerName: provider.name,
      firstGloss: result.primary[0]?.gloss ?? "MISSING_KEY",
    };
    await insertAtlasAiUsage({
      userId,
      jobId: job.id,
      imageId: image.id,
      provider: result.provider,
      model: result.model,
      operation: stage,
      detailLevel:
        stage === "escalated"
          ? process.env.ATLAS_OPENAI_ESCALATE_DETAIL ?? null
          : process.env.ATLAS_OPENAI_DEFAULT_DETAIL ?? null,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      imageCount: result.usage?.imageCount,
      estimatedCostUsd: result.usage?.estimatedCostUsd,
      latencyMs: result.usage?.latencyMs,
      success: true,
    });
    const updatedJob = await completeAtlasRecognitionJob(userId, job.id, result);
    const candidates = await replaceAtlasCandidates(
      userId,
      image.id,
      job.id,
      input.targetLanguage,
      result,
    );
    await updateAtlasImageStatus(userId, image.id, "needs_review");

    return NextResponse.json(
      {
        job: updatedJob
          ? {
              id: updatedJob.id,
              status: updatedJob.status,
              stage: updatedJob.stage,
              provider: updatedJob.provider,
              model: updatedJob.model,
              uncertaintyReason: updatedJob.uncertainty_reason,
            }
          : { id: job.id, status: "needs_review", stage },
        candidates,
        result,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "recognition failed";
    await insertAtlasAiUsage({
      userId,
      jobId: job.id,
      imageId: image.id,
      provider: provider.name,
      model: null,
      operation: stage,
      detailLevel: null,
      success: false,
    }).catch((usageErr) => console.warn("[atlas/recognize] usage insert failed", usageErr));
    await Promise.all([
      failAtlasRecognitionJob(userId, job.id, message),
      updateAtlasImageStatus(userId, image.id, "failed", message),
    ]);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
