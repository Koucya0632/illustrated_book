import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSettings, saveSettings } from "@/lib/users-db";
import { normalizeSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const settings = await getSettings(userId);
  return NextResponse.json({ settings });
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  // normalizeSettings clamps every field to a valid value, so untrusted input
  // can't write garbage.
  const settings = normalizeSettings(body as Record<string, unknown>);
  await saveSettings(userId, settings);
  return NextResponse.json({ ok: true, settings });
}
