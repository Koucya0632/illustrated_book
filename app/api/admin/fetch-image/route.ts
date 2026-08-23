// Server-side image fetcher. Used to migrate words whose original image_url
// can't be downloaded from local IPs (Wikimedia rate-limits our home IP
// aggressively). Vercel functions egress from a different IP range so the
// rate limit hits a different bucket.
//
// POST body: { id, sourceUrl }
// Returns: { url, path } — the public Storage URL for the uploaded image,
//   and writes the row's image_url / image_source_url / image_license.

import { NextResponse } from "next/server";
import { WORD_IMAGE_CONTENT_TYPE, encodeWordImage } from "@/lib/word-image-encode";
import postgres from "postgres";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BUCKET = "word-images";
const ID_RE = /^[a-z0-9-]{1,64}$/;


function licenseTagForUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (host.endsWith("wikimedia.org") || host.endsWith("wikipedia.org")) {
      return "wikimedia-commons";
    }
    if (host.endsWith("loremflickr.com")) return "unknown";
  } catch {
    return "external";
  }
  return "external";
}

export async function POST(req: Request) {
  let body: { id?: string; sourceUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const id = String(body.id ?? "").trim();
  const sourceUrl = String(body.sourceUrl ?? "").trim();
  if (!ID_RE.test(id)) {
    return NextResponse.json({ error: "id must be kebab-case" }, { status: 400 });
  }
  if (!/^https?:\/\//.test(sourceUrl)) {
    return NextResponse.json({ error: "sourceUrl must be http(s)" }, { status: 400 });
  }

  // Fetch from a Vercel egress IP — different bucket than our home IP.
  let res: Response;
  try {
    res = await fetch(sourceUrl, {
      headers: { "User-Agent": "everyday-english-picture-dictionary/1.0 (admin-fetch)" },
      redirect: "follow",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "fetch failed" }, { status: 502 });
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: `HTTP ${res.status} from source` },
      { status: res.status === 429 ? 429 : 502 },
    );
  }
  // Whatever the remote host served, what lands in the bucket is WebP at
  // 1200px — same encoder every other writer uses.
  const buf = await encodeWordImage(Buffer.from(await res.arrayBuffer()));

  const supabase = createServiceRoleClient();
  const path = `${id}.webp`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buf, {
    contentType: WORD_IMAGE_CONTENT_TYPE,
    upsert: true,
    cacheControl: "31536000",
  });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
  const license = licenseTagForUrl(sourceUrl);

  // Also update the DB row so subsequent runs skip it.
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    const sql = postgres(dbUrl, { ssl: "require", prepare: false, max: 1 });
    try {
      await sql`
        UPDATE words SET
          image_url = ${publicUrl},
          image_source_url = COALESCE(image_source_url, ${sourceUrl}),
          image_license = COALESCE(image_license, ${license})
        WHERE id = ${id}
      `;
    } finally {
      await sql.end();
    }
  }

  return NextResponse.json({ url: publicUrl, path, license });
}
