import { NextResponse } from "next/server";
import { create, listAll } from "@/lib/words-db";
import { validateWord } from "@/lib/word-validate";
import type { Word } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await listAll();
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  let body: Partial<Word>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const err = validateWord(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  try {
    await create(body as Word);
    return NextResponse.json({ ok: true, id: body.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "create failed";
    const status = /unique|duplicate/i.test(msg) ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
