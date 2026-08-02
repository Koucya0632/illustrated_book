// Public author profile (docs/COMMUNITY_ATLAS_PLAN.md §3B).
//
// Identity + their approved public items + the aggregate "how much did this
// help people" signals. Public and CDN-cacheable; contains no private data —
// no email, no user id beyond what's already implicit in public items.

import { NextResponse } from "next/server";
import { authorProfile } from "@/lib/profile/live-author-profile";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { username: string } },
) {
  const profile = await authorProfile.load(params.username);
  if (!profile) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(
    profile,
    {
      headers: {
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400",
      },
    },
  );
}
