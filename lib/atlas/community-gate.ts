// 物見 write gate (docs/MEMBERSHIP_ENGINEERING_CHECKLIST.md §5). Under policy v2
// a signed-in non-member may read published collections and items but not
// save, learn, create, edit, upload, submit or publish. Deleting / withdrawing
// their OWN work, reporting and blocking stay open — those routes never call
// this. A no-op under v1 (getMembershipAccess skips the lookup).

import { NextResponse } from "next/server";
import { getMembershipAccess } from "@/lib/atlas/entitlement";

/** A 402 to return, or null when the write may proceed. */
export async function communityWriteRefusal(userId: string): Promise<NextResponse | null> {
  const access = await getMembershipAccess(userId);
  if (access.policy === "v2" && access.tier === "free") {
    return NextResponse.json(
      {
        error: "membership_required",
        scope: "community",
        message: "收藏、學習與投稿物見內容是會員功能，成為永久會員即可使用。",
      },
      { status: 402, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return null;
}
