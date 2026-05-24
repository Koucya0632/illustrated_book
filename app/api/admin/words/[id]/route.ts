import { NextResponse } from "next/server";
import { getById, remove, update } from "@/lib/words-db";
import { validateWord } from "@/lib/word-validate";
import type { Word } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const w = await getById(params.id);
    if (!w) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ item: w });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  let body: Partial<Word>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  // Allow id rename only if the body carries the new id, but keep validation strict
  const merged: Word = { ...(body as Word), id: body.id ?? params.id };
  const err = validateWord(merged);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  try {
    await update(params.id, merged);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "update failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    await remove(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "delete failed" },
      { status: 500 },
    );
  }
}
