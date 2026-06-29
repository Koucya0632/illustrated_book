import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { getAtlasSyncBundle } from "@/lib/atlas-db";
import { createAtlasImageSignedUrls } from "@/lib/atlas/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseSince(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function cleanLimit(value: string | null): number {
  const n = Number(value || 500);
  return Number.isFinite(n) ? Math.min(1000, Math.max(1, Math.floor(n))) : 500;
}

export async function GET(req: Request) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const since = parseSince(searchParams.get("since"));
  const limit = cleanLimit(searchParams.get("limit"));
  const bundle = await getAtlasSyncBundle(userId, since, limit);

  const imageUrls = new Map<string, { imageUrl: string; thumbUrl: string }>();
  await Promise.all(
    bundle.images
      .filter((image) => image.deleted_at == null)
      .map(async (image) => {
        try {
          imageUrls.set(
            image.id,
            await createAtlasImageSignedUrls({
              imagePath: image.original_path,
              thumbPath: image.thumb_path,
            }),
          );
        } catch {
          imageUrls.set(image.id, { imageUrl: "", thumbUrl: "" });
        }
      }),
  );

  return NextResponse.json(
    {
      serverTime: bundle.serverTime,
      images: bundle.images.map((image) => {
        const urls = imageUrls.get(image.id);
        return {
          id: image.id,
          status: image.status,
          width: image.width,
          height: image.height,
          byteSize: image.byte_size,
          mimeType: image.mime_type,
          imageUrl: urls?.imageUrl || null,
          thumbUrl: urls?.thumbUrl || null,
          createdAt: image.created_at,
          updatedAt: image.updated_at,
          deletedAt: image.deleted_at,
        };
      }),
      items: bundle.items.map((item) => ({
        id: item.id,
        imageId: item.image_id,
        targetLanguage: item.target_language,
        canonicalWordId: item.canonical_word_id,
        primaryLabel: item.primary_label,
        fineLabel: item.fine_label,
        lemma: item.lemma,
        displayZhHant: item.display_zh_hant,
        partOfSpeech: item.part_of_speech,
        cefrLevel: item.cefr_level,
        pronunciation: item.pronunciation,
        reading: item.reading,
        category: item.category,
        taxonomyPath: item.taxonomy_path,
        definitionZhHant: item.definition_zh_hant,
        definitionTarget: item.definition_target,
        exampleTarget: item.example_target,
        exampleZhHant: item.example_zh_hant,
        noteZhHant: item.note_zh_hant,
        visibility: item.visibility,
        reviewStatus: item.review_status,
        publicSlug: item.public_slug,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        deletedAt: item.deleted_at,
      })),
      cards: bundle.cards.map((card) => ({
        id: card.id,
        itemId: card.item_id,
        imageId: card.image_id,
        deckKey: card.deck_key,
        cardType: card.card_type,
        frontText: card.front_text,
        back: card.back,
        explanation: card.explanation,
        tags: card.tags,
        createdAt: card.created_at,
        updatedAt: card.updated_at,
        deletedAt: card.deleted_at,
      })),
      cardStates: bundle.cardStates.map((state) => ({
        cardId: state.card_id,
        status: state.status,
        intervalDays: Number(state.interval_days),
        nextReviewAt: state.next_review_at,
        reviewCount: state.review_count,
        mistakeCount: state.mistake_count,
        lastRating: state.last_rating,
        lastReviewedAt: state.last_reviewed_at,
        updatedAt: state.updated_at,
      })),
      mastery: bundle.mastery.map((row) => ({
        itemId: row.item_id,
        targetLanguage: row.target_language,
        mastery: Number(row.mastery),
        lastReviewedAt: row.last_reviewed_at,
        reviewCount: row.review_count,
        updatedAt: row.updated_at,
      })),
      paging: {
        limit,
        truncated:
          bundle.images.length === limit ||
          bundle.items.length === limit ||
          bundle.cards.length === limit ||
          bundle.cardStates.length === limit ||
          bundle.mastery.length === limit,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
