// The pool of items the current user can add to a collection: their own
// confirmed public, pending, and private items in the given language. Fresh
// (private, no-store) so a just-confirmed item appears immediately.
//
// Static `candidates` segment takes precedence over the sibling `[id]` route,
// so this never collides with GET /api/atlas/collections/{uuid}.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSql } from "@/lib/db";
import { listAtlasCollectionCandidates } from "@/lib/atlas-db";
import { atlasPublicImageUrl, createAtlasImageSignedUrlsBatch } from "@/lib/atlas/storage";
import type { AtlasTargetLanguage } from "@/lib/atlas/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function targetLanguage(v: string | null): AtlasTargetLanguage | null {
  return v === "en" || v === "ja" ? v : null;
}

export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!getSql()) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  const lang = targetLanguage(new URL(req.url).searchParams.get("lang"));
  if (!lang) return NextResponse.json({ error: "invalid lang" }, { status: 400 });

  const rows = await listAtlasCollectionCandidates(userId, lang);
  const signed = await createAtlasImageSignedUrlsBatch(
    rows.map((row) => ({ imagePath: row.thumb_path, thumbPath: row.thumb_path })),
  );
  return NextResponse.json(
    {
      items: rows.map((row, index) => ({
        id: row.id,
        slug: row.public_item_id ?? row.id,
        publicItemId: row.public_item_id,
        lemma: row.lemma,
        displayZhHant: row.display_zh_hant,
        targetLanguage: row.target_language,
        category: row.category,
        reviewStatus: row.review_status,
        publicationState: row.public_item_id
          ? "public"
          : row.review_status === "pending" ||
              row.review_status === "pending_auto" ||
              row.review_status === "pending_review"
            ? "pending"
            : "private",
        eligible: row.eligible,
        imageUrl: row.image_public_path
          ? atlasPublicImageUrl(row.image_public_path)
          : signed[index]?.thumbUrl ?? null,
        author: null,
        publishedAt: null,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
