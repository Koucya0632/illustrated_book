import { NextResponse } from "next/server";
import { getWord } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public single-word detail as JSON — used by the study peek modal (getWord is
// server-only, so the client fetches it through here). Word data is public.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const word = await getWord(params.id);
  if (!word) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(word);
}
