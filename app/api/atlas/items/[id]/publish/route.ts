// 發佈到物見: hand the author's own item to the machine gate. Clean photos go
// live at once, risky ones wait for a human (lib/atlas/publication.ts, `submit`).
// Only draft / rejected / withdrawn items may be submitted: an item reports
// pulled back is not the author's to put back up.

import { NextResponse } from "next/server";
import { isAtlasItemLocked } from "@/lib/atlas/entitlement";
import { communityWriteRefusal } from "@/lib/atlas/community-gate";
import { getCurrentUserId } from "@/lib/current-user";
import { atlasPublication } from "@/lib/atlas/publication-live";
import { isUuid } from "@/lib/http/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store" };

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const membershipRefusal = await communityWriteRefusal(userId);
  if (membershipRefusal) return membershipRefusal;
  if (!isUuid(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (await isAtlasItemLocked(userId, params.id)) {
    return NextResponse.json(
      {
        error: "item_locked",
        message: "這張卡片超過目前方案的格數，已鎖定。升級後即可繼續使用，也可以刪除其他卡片騰出空間。",
      },
      { status: 402, headers: PRIVATE },
    );
  }

  const result = await atlasPublication().submit(userId, params.id);
  if (!result.ok) {
    if (result.reason === "restricted") {
      // Repeat offenders lose publishing (docs/COMMUNITY_ATLAS_PLAN.md §5.5); their private 圖鑑 keeps working.
      return NextResponse.json(
        { error: "publishing_restricted", message: "你的帳號目前無法公開內容。" },
        { status: 403, headers: PRIVATE },
      );
    }
    if (result.reason === "not_allowed") {
      return NextResponse.json({ error: "not_submittable" }, { status: 409, headers: PRIVATE });
    }
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      item: { ...result.item, review_status: result.reviewStatus },
      moderation: { reviewStatus: result.reviewStatus, published: result.published },
    },
    { headers: PRIVATE },
  );
}
