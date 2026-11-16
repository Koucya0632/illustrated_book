// Public, read-only deployment attestation for the regional catalogue guard.
// Hashes allow a release tool to compare reviewed local inputs without exposing
// reserved IDs or not-yet-published content.
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import reservedIds from "@/data/australian-only-word-ids.json";
import { australianVariantsCacheKey } from "@/lib/australian-word-variants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const candidateCommit = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
  const deploymentCommit = /^[a-f0-9]{40}$/i.test(candidateCommit)
    ? candidateCommit.toLowerCase()
    : null;
  const reservedIdsSha256 = createHash("sha256")
    .update(JSON.stringify([...reservedIds].sort()))
    .digest("hex");
  return NextResponse.json({
    guardProtocol: "tuji-australia-catalogue-v1",
    deploymentCommit,
    deploymentCommitSource: "vercel-environment-self-reported",
    reservedIdCount: reservedIds.length,
    reservedIdsSha256,
    configurationSha256: australianVariantsCacheKey,
  }, {
    headers: { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store" },
  });
}
