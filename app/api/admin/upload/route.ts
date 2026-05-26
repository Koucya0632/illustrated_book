// Admin-only image upload. The middleware gates this route via the
// `eepd_admin` cookie, so by the time the handler runs we're authorized.
//
// Accepts multipart/form-data with two fields:
//   file:  the image File (image/jpeg | image/png | image/webp | image/gif)
//   id:    word id (kebab-case slug; determines the storage path)
//
// Writes to the `word-images` bucket at `{id}.{ext}` (upsert) and returns
// the public Storage URL. The caller (WordForm) puts that URL into the
// image_url field of the word being edited.

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "word-images";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const ID_RE = /^[a-z0-9-]{1,64}$/;

function extFor(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }
  const id = String(form.get("id") ?? "").trim();
  const file = form.get("file");

  if (!ID_RE.test(id)) {
    return NextResponse.json({ error: "id must be kebab-case" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field required" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: `unsupported type: ${file.type || "unknown"}` },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `file too large (${file.size} > ${MAX_BYTES})` },
      { status: 413 },
    );
  }

  const supabase = createServiceRoleClient();
  const ext = extFor(file.type);
  const path = `${id}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage.from(BUCKET).upload(path, buf, {
    contentType: file.type,
    upsert: true,
    cacheControl: "31536000",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
  return NextResponse.json({ url: publicUrl, path });
}
