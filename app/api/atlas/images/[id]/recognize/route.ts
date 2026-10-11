import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { refuseLegacyAtlasWrite } from "@/lib/credits/legacy-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Retired: 識別 is a credit operation now (POST /api/ai/quotes → /api/ai/operations).
// See refuseLegacyAtlasWrite for what a released app receives.
export async function POST() {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return refuseLegacyAtlasWrite(userId);
}
