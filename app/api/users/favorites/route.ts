import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { addFavorite, getFavorites, removeFavorite } from "@/lib/users-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ favorites: [] });
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
