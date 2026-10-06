import { after } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { getSql } from "@/lib/db";
import { userCreditConfig, CreditError } from "../credits/policy";
import { createAiOperations } from "./service";
import { createAiHandler } from "./http";
import { createAiRunner } from "./runner";
import { OperationError } from "./contracts";
import { downloadAtlasObject } from "../atlas/storage";
import { createEscalateAtlasProvider, createPrimaryAtlasProvider } from "../atlas/recognition";
import type { AtlasVisionInput } from "../atlas/vision-provider";
import { hitRateLimit } from "../ratelimit";
import { createFulfillments } from "./fulfillment";
import { createFulfillmentRunner } from "./fulfillment-runner";
import { generateCreditEnrichment } from "../atlas/enrich";

export function serverAiOperations() {
  const sql = getSql();
  if (!sql) throw new CreditError("credits_unavailable");
  return createAiOperations(sql);
}
export const handleAiRequest = createAiHandler({
  currentUserId: getCurrentUserIdFast, config: userCreditConfig,
  enabled: () => process.env.AI_CREDITS_OPERATIONS_ENABLED === "true" &&
    process.env.AI_CREDITS_WORKER_ENABLED === "true" && Boolean(process.env.CRON_SECRET),
  operations: serverAiOperations,
  reportError: () => console.error("[ai-operations] request failed"),
  // Waiting for the per-minute pg_cron tick cost 20–57s per recognition; run it now instead.
  dispatch: (kind, account, id) => after(async () => {
    if (process.env.AI_CREDITS_WORKER_ENABLED !== "true") return;
    try {
      await (kind === "operation" ? serverAiRunner()(account, id) : serverFulfillmentRunner()(account, id));
    } catch {
      console.error(`[ai-operations] immediate ${kind} run failed; cron will recover`);
    }
  }),
});

export function serverFulfillments() {
  const sql = getSql();
  if (!sql) throw new CreditError("credits_unavailable");
  return createFulfillments(sql);
}
export function serverFulfillmentRunner(service = serverFulfillments()) {
  return createFulfillmentRunner(service, async lease => {
    const result = await hitRateLimit({ bucket: "atlas-ai:credits-enrich-global", windowSeconds: 86_400,
      limit: 5000, failClosed: true });
    if (!result.available || !result.ok) throw new CreditError("credits_unavailable");
    return generateCreditEnrichment(lease.item);
  });
}

export function serverAiRunner(operations = serverAiOperations()) {
  return createAiRunner<AtlasVisionInput>(operations, {
    prepare: async ({ operation }) => {
      const sql = getSql();
      if (!sql) throw new CreditError("credits_unavailable");
      const [image] = await sql`SELECT original_path, mime_type, sha256 FROM user_atlas_images
        WHERE id = ${operation.image_id} AND user_id = ${operation.user_id} AND deleted_at IS NULL`;
      if (!image || image.sha256 !== operation.image_sha256) throw new OperationError("image_not_found");
      const sharp = (await import("sharp")).default;
      const bytes = await downloadAtlasObject(image.original_path);
      const imageBytes = await sharp(bytes, { limitInputPixels: 24_000_000 })
        .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 }).toBuffer();
      return { imageBytes, mimeType: "image/webp", targetLanguage: operation.input.targetLanguage,
        glossLanguage: operation.input.glossLanguage };
    },
    execute: async (input, { operation }) => {
      const envLimit = Number(process.env.ATLAS_AI_DAILY_GLOBAL);
      const limit = Number.isSafeInteger(envLimit) && envLimit > 0 ? envLimit : 5000;
      for (const rule of [
        { bucket: `atlas-ai:credits-user:${operation.user_id}`, windowSeconds: 60, limit: 12 },
        { bucket: "atlas-ai:global", windowSeconds: 86_400, limit },
      ]) {
        const result = await hitRateLimit({ ...rule, failClosed: true });
        if (!result.available) throw new CreditError("credits_unavailable");
        if (!result.ok) throw new OperationError("rate_limited");
      }
      if (operation.input.feature === "atlas.recognize.primary") {
        return createPrimaryAtlasProvider("pro").recognizePrimary(input);
      }
      const provider = createEscalateAtlasProvider();
      return provider.recognizeEscalated ? provider.recognizeEscalated(input) : provider.recognizePrimary(input);
    },
  });
}
