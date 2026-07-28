// Public author profile (docs/COMMUNITY_ATLAS_PLAN.md §3B).
//
// Identity + their approved public items + the aggregate "how much did this
// help people" signals. Public and CDN-cacheable; contains no private data —
// no email, no user id beyond what's already implicit in public items.

import { NextResponse } from "next/server";
import { getAtlasAuthor, listAtlasAuthorItems } from "@/lib/atlas-db";
import { serializeAtlasPublicItem } from "@/lib/atlas/public-serialize";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { username: string } },
) {
  const username = params.username.trim();
  // Same shape the profiles table enforces; rejects probing garbage early.
  if (!/^[A-Za-z0-9_.-]{1,40}$/.test(username)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const author = await getAtlasAuthor(username);
  // Also 404 for real accounts with nothing public — this endpoint must not
  // confirm whether an arbitrary username exists.
  if (!author) return NextResponse.json({ error: "not found" }, { status: 404 });

  const rows = await listAtlasAuthorItems(author.user_id);

  return NextResponse.json(
    {
      // No fallback to the handle: a profile that reached this route has a
      // confirmed identity, so the display name is set. Falling back would put
      // the handle — historically an email local part — on screen as a name.
      author: {
        handle: author.username,
        displayName: author.nickname?.trim() ?? "",
        avatar: author.avatar,
        joinedAt: author.joined_at,
        publishedCount: author.published_count,
        saveCount: author.save_count,
      },
      items: rows.map(serializeAtlasPublicItem),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400",
      },
    },
  );
}
