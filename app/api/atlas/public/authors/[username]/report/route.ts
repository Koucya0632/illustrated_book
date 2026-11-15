// 檢舉一個作者身分 — the 暱稱, 簽名 and 頭像 on a public author profile.
//
// **No auto-escalation, by design.** An author identity has no review status to
// flip, and hiding someone's whole presence is a different act from hiding one
// thing they made: three coordinated reports must not be able to erase a person
// from 物見. These wait for a human, which is exactly why the webhook matters
// here more than anywhere else.

import { NextResponse } from "next/server";
import { handleReport } from "@/lib/atlas/report-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  const handle = params.username.trim();
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(handle)) return NextResponse.json({ error: "not found" }, { status: 404 });
  return handleReport(req, { type: "author", handle });
}
