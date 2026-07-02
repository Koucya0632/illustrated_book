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
import {
  createEscalateAtlasProvider,
  createFineAtlasProvider,
  createPrimaryAtlasProvider,
} from "@/lib/atlas/recognition";
import { downloadAtlasObject, removeAtlasPrivateObjects } from "@/lib/atlas/storage";
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

  const mode = body.mode === "fine" || body.mode === "escalate" ? body.mode : "primary";
  const stage: AtlasRecognitionStage =
    mode === "fine" ? "fine" : mode === "escalate" ? "escalated" : "primary";
  const provider =
    stage === "primary"
      ? createPrimaryAtlasProvider()
      : stage === "escalated"
      ? createEscalateAtlasProvider()
      : createFineAtlasProvider();
  const job = await createAtlasRecognitionJob(userId, image.id, stage);

  await Promise.all([
    updateAtlasImageStatus(userId, image.id, "processing"),
    markAtlasRecognitionRunning(userId, job.id, provider.name, stage),
  ]);

  try {
    const settingsPromise = getSettings(userId);
    // recognition.webp (1024px) is deleted after the first successful pass, so
    // fall back to the 1600px display for re-runs (e.g. escalate).
    let imageBytes: Buffer;
    try {
      imageBytes = await downloadAtlasObject(image.recognition_path);
    } catch {
      imageBytes = await downloadAtlasObject(image.original_path);
    }
    const settings = await settingsPromise;
    const input = {
      imageBytes,
      mimeType: image.mime_type,
      targetLanguage: targetLanguageFromDirection(settings.learningDirection),
    };
    const result =
      stage === "primary"
        ? await provider.recognizePrimary(input)
        : stage === "escalated" && provider.recognizeEscalated
        ? await provider.recognizeEscalated(input)
        : await provider.recognizeFine(input);
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
    // recognition.webp is a throwaway — drop it now that candidates are saved.
    // Re-runs (escalate) fall back to the 1600px display (see download above).
    // Fire-and-forget so cleanup never delays the response.
    void removeAtlasPrivateObjects([image.recognition_path]).catch((cleanupErr) =>
      console.warn("[atlas/recognize] recognition cleanup failed", cleanupErr),
    );

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
