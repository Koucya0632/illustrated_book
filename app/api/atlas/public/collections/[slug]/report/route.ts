// 檢舉一個公開合集 — its title, 簡介 and 頭像 are public UGC in their own right,
// separate from the items it curates. Enough reports pull it back for a human
// and hide it meanwhile (lib/atlas/publication.ts, `fileReport`).

import { NextResponse } from "next/server";
import { handleReport } from "@/lib/atlas/report-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const slug = params.slug.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return NextResponse.json({ error: "not found" }, { status: 404 });
  return handleReport(req, { type: "collection", slug });
}
