import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { refuseLegacyAtlasWrite } from "@/lib/credits/legacy-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Retired: 補充 is the included fulfillment of a credit operation, run by the worker.
// See refuseLegacyAtlasWrite for what a released app receives.
export async function POST() {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return refuseLegacyAtlasWrite(userId);
}
