import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { syncFromClient } from "@/lib/users-db";
import type { LearningDirection } from "@/lib/settings";
import { targetLanguageFor } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Total word_ids the dictionary has is in the low hundreds — anything beyond
// this is either a bug or someone trying to flood our DB with one-at-a-time
// INSERTs.
const MAX_IDS = 2000;
const MAX_ID_LEN = 64;

function cleanIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    if (v.length === 0 || v.length > MAX_ID_LEN) continue;
    out.push(v);
    if (out.length >= MAX_IDS) break;
  }
  return out;
}

// Merge localStorage state with server state. Called once after login/register.
// Client posts whatever it has; server upserts and returns the authoritative
// merged set, which the client then writes back to localStorage.
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: {
    favorites?: string[];
    learned?: string[];
    learningDirection?: LearningDirection;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const fav = cleanIds(body.favorites);
  const learned = cleanIds(body.learned);
  const direction: LearningDirection =
    body.learningDirection === "zh-ja" ? "zh-ja" : "zh-en";
  const merged = await syncFromClient(
    userId,
    fav,
    learned,
    targetLanguageFor(direction),
  );
  return NextResponse.json(merged);
}
