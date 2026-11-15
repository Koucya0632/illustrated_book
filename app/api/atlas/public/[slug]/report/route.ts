// 檢舉一張公開卡片. A card shared to a 景點 may also be reported as
// 「不是在這裡拍的」, which an admin resolves by taking it off that spot.
// What a report does lives in lib/atlas/publication.ts (`fileReport`).

import { NextResponse } from "next/server";
import { handleReport } from "@/lib/atlas/report-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const slug = params.slug.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return NextResponse.json({ error: "not found" }, { status: 404 });
  return handleReport(req, { type: "item", slug });
}
