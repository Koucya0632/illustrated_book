// Owner-gated single-collection endpoints: GET (edit view with members),
// PATCH (title/description/cover) and DELETE. target_language is fixed at
// creation to keep the member-language invariant, so it is not editable here.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSql } from "@/lib/db";
import {
  deleteAtlasCollection,
  getOwnedAtlasCollection,
  updateAtlasCollection,
} from "@/lib/atlas-db";
import {
  atlasPublicImageUrl,
  createAtlasImageSignedUrlsBatch,
  createCollectionAvatarSignedUrl,
  removeCollectionAvatar,
} from "@/lib/atlas/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invalidId(id: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const owned = await getOwnedAtlasCollection(params.id, userId);
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });
  const avatarPreviewUrl = owned.collection.avatar_private_path
    ? await createCollectionAvatarSignedUrl(owned.collection.avatar_private_path)
    : null;
  const memberSignedUrls = await createAtlasImageSignedUrlsBatch(
    owned.members.map((member) => ({ imagePath: member.thumb_path, thumbPath: member.thumb_path })),
  );

  return NextResponse.json(
    {
      collection: {
        id: owned.collection.id,
        slug: owned.collection.slug,
        title: owned.collection.title,
        description: owned.collection.description,
        targetLanguage: owned.collection.target_language,
        reviewStatus: owned.collection.review_status,
        avatarColor: owned.collection.avatar_color,
        avatarPreviewUrl,
        coverPublicItemId: owned.collection.cover_public_item_id,
        coverImageUrl: atlasPublicImageUrl(
          owned.items.find((i) => i.id === owned.collection.cover_public_item_id)?.image_public_path ??
            owned.items[0]?.image_public_path ??
            null,
        ),
        publishedAt: owned.collection.published_at,
        updatedAt: owned.collection.updated_at,
      },
      items: owned.members.map((member, index) => ({
        id: member.id,
        slug: member.public_item_id ?? member.id,
        publicItemId: member.public_item_id,
        lemma: member.lemma,
        displayZhHant: member.display_zh_hant,
        targetLanguage: member.target_language,
        category: member.category,
        reviewStatus: member.review_status,
        publicationState: member.public_item_id
          ? "public"
          : member.review_status === "pending" ||
              member.review_status === "pending_auto" ||
              member.review_status === "pending_review"
            ? "pending"
            : "private",
        eligible: member.eligible,
        imageUrl: member.image_public_path
          ? atlasPublicImageUrl(member.image_public_path)
          : memberSignedUrls[index]?.thumbUrl ?? null,
        author: null,
        publishedAt: null,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: { title?: unknown; description?: unknown; coverPublicItemId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const owned = await getOwnedAtlasCollection(params.id, userId);
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });

  const title = typeof body.title === "string" ? body.title.trim() : owned.collection.title;
  if (!title || title.length > 60) return NextResponse.json({ error: "invalid title" }, { status: 400 });
  const description =
    body.description === undefined
      ? owned.collection.description
      : typeof body.description === "string"
        ? body.description.trim().slice(0, 500) || null
        : null;

  // Cover must be one of this collection's members (or cleared).
  let coverPublicItemId = owned.collection.cover_public_item_id;
  if (body.coverPublicItemId !== undefined) {
    const candidate = body.coverPublicItemId;
    if (candidate === null) {
      coverPublicItemId = null;
    } else if (
      typeof candidate === "string" &&
      owned.members.some((i) => i.public_item_id === candidate)
    ) {
      coverPublicItemId = candidate;
    } else {
      return NextResponse.json({ error: "invalid cover" }, { status: 400 });
    }
  }

  const row = await updateAtlasCollection({
    id: params.id,
    ownerUserId: userId,
    title,
    description,
    coverPublicItemId,
  });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!getSql()) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  const owned = await getOwnedAtlasCollection(params.id, userId);
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });
  const ok = await deleteAtlasCollection(params.id, userId);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (owned.collection.avatar_private_path) {
    await removeCollectionAvatar(owned.collection.avatar_private_path).catch((error) => {
      console.error("[atlas/collections] avatar cleanup failed", error);
    });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
