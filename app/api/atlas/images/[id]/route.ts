import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { deleteAtlasImageCascade, getAtlasImage, getLatestAtlasRecognitionJob } from "@/lib/atlas-db";
import {
  createAtlasImageSignedUrls,
  removeAtlasPrivateObjects,
  removeAtlasPublicObjects,
} from "@/lib/atlas/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invalidId(id: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const image = await getAtlasImage(userId, params.id);
  if (!image) return NextResponse.json({ error: "not found" }, { status: 404 });
  const job = await getLatestAtlasRecognitionJob(userId, image.id);
  const urls = await createAtlasImageSignedUrls({
    imagePath: image.original_path,
    thumbPath: image.thumb_path,
  });

  return NextResponse.json(
    {
      image: {
        id: image.id,
        status: image.status,
        width: image.width,
        height: image.height,
        createdAt: image.created_at,
        updatedAt: image.updated_at,
        imageUrl: urls.imageUrl,
        thumbUrl: urls.thumbUrl,
      },
      job: job
        ? {
            id: job.id,
            status: job.status,
            stage: job.stage,
            provider: job.provider,
            model: job.model,
            uncertaintyReason: job.uncertainty_reason,
            escalated: job.escalated,
            createdAt: job.created_at,
            updatedAt: job.updated_at,
          }
        : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const paths = await deleteAtlasImageCascade(userId, params.id);
  if (!paths) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    await Promise.all([
      removeAtlasPrivateObjects(paths.privatePaths),
      removeAtlasPublicObjects(paths.publicPaths),
    ]);
  } catch (err) {
    console.error("[atlas/images/delete] storage cleanup failed", err);
    return NextResponse.json(
      { error: "deleted database rows but storage cleanup failed" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
