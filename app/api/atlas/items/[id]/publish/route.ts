import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { isAtlasAuthorBlocked, submitAtlasItemForReview } from "@/lib/atlas-db";
import { hasConfirmedPublicAuthor } from "@/lib/users-db";
import { processAtlasSubmission } from "@/lib/atlas/submit-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invalidId(id: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Repeat offenders lose the ability to publish (docs/COMMUNITY_ATLAS_PLAN.md
  // §5.5). Their private 圖鑑 keeps working — only sharing is withdrawn.
  if (await isAtlasAuthorBlocked(userId)) {
    return NextResponse.json(
      { error: "publishing_restricted", message: "你的帳號目前無法公開內容。" },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  // Consent gate: publishing names the author, so it may not run before the
  // user has accepted a public identity (the one-time 公開作者身分 screen).
  if (!(await hasConfirmedPublicAuthor(userId))) {
    return NextResponse.json(
      { error: "author_identity_required", message: "請先設定你的公開作者身分。" },
      { status: 409, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const item = await submitAtlasItemForReview(userId, params.id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Machine gate: clean submissions publish immediately, risky ones wait for a
  // human. Never throws — a failure leaves the item queued for review.
  const outcome = await processAtlasSubmission(item);

  return NextResponse.json(
    {
      item: { ...item, review_status: outcome.reviewStatus },
      moderation: {
        reviewStatus: outcome.reviewStatus,
        published: outcome.published,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
