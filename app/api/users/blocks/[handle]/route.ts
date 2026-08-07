// 解除封鎖. Idempotent — unblocking someone who was never blocked is a no-op,
// so a client retrying after a dropped response never sees a spurious failure.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSql } from "@/lib/db";
import { unblockHandle } from "@/lib/blocks-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HANDLE = /^[A-Za-z0-9_-]{1,32}$/;

export async function DELETE(
  _req: Request,
  { params }: { params: { handle: string } },
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!getSql()) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  const handle = params.handle.trim();
  if (!HANDLE.test(handle)) {
    return NextResponse.json({ error: "invalid handle" }, { status: 400 });
  }

  await unblockHandle(userId, handle);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
