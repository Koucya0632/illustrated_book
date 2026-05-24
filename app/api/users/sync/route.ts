import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { syncFromClient } from "@/lib/users-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Merge localStorage state with server state. Called once after login/register.
// Client posts whatever it has; server upserts and returns the authoritative
// merged set, which the client then writes back to localStorage.
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { favorites?: string[]; learned?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const fav = Array.isArray(body.favorites) ? body.favorites.filter(s => typeof s === "string") : [];
  const learned = Array.isArray(body.learned) ? body.learned.filter(s => typeof s === "string") : [];
  const merged = await syncFromClient(userId, fav, learned);
  return NextResponse.json(merged);
}
