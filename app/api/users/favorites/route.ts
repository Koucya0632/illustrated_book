import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { addFavorite, getFavorites, removeFavorite } from "@/lib/users-db";
import { presentsBearerToken } from "@/lib/refused-bearer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    // A refused token is not a guest: see lib/refused-bearer.ts.
    return presentsBearerToken(req)
      ? NextResponse.json({ error: "unauthorized" }, { status: 401 })
      : NextResponse.json({ favorites: [] });
  }
  const favorites = await getFavorites(userId);
  return NextResponse.json({ favorites });
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { wordId?: string; favorite?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!body.wordId || typeof body.favorite !== "boolean") {
    return NextResponse.json({ error: "wordId + favorite required" }, { status: 400 });
  }
  try {
    if (body.favorite) await addFavorite(userId, body.wordId);
    else await removeFavorite(userId, body.wordId);
  } catch (e) {
    // FK violation = unknown word; ignore.
    if (!/foreign key/i.test(e instanceof Error ? e.message : "")) throw e;
  }
  return NextResponse.json({ ok: true });
}
