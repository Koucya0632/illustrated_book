import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { addLearned } from "@/lib/users-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { wordId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!body.wordId) {
    return NextResponse.json({ error: "wordId required" }, { status: 400 });
  }
  try {
    await addLearned(userId, body.wordId);
  } catch (e) {
    if (!/foreign key/i.test(e instanceof Error ? e.message : "")) throw e;
  }
  return NextResponse.json({ ok: true });
}
