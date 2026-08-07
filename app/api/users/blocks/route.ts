// 封鎖名單 — read and add.
//
// The list lives on the server so it follows the account across devices, but it
// is *applied* on the client: the four public 物見 endpoints are anonymous and
// share one CDN cache (`by-lemma` is hit on every word detail view at
// s-maxage=3600), and making them per-user would mean `private, no-store` on all
// of them. A block list is small and rarely changes, so the client can hold it
// and filter — see docs/adr for the trade-off.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSql } from "@/lib/db";
import { blockHandle, listBlockedHandles } from "@/lib/blocks-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HANDLE = /^[A-Za-z0-9_-]{1,32}$/;

const PRIVATE = { "Cache-Control": "private, no-store" } as const;

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!getSql()) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  const handles = await listBlockedHandles(userId);
  return NextResponse.json({ handles, total: handles.length }, { headers: PRIVATE });
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!getSql()) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  let body: { handle?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const handle = typeof body.handle === "string" ? body.handle.trim() : "";
  if (!HANDLE.test(handle)) {
    return NextResponse.json({ error: "invalid handle" }, { status: 400 });
  }

  const outcome = await blockHandle(userId, handle);
  if (outcome === "not_found") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (outcome === "self") {
    return NextResponse.json({ error: "cannot block yourself" }, { status: 400 });
  }
  // "already" is success: blocking someone twice is the state the caller wanted.
  return NextResponse.json({ ok: true, already: outcome === "already" }, { headers: PRIVATE });
}
