import { NextResponse } from "next/server";
import { getCurrentUserBundle } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const bundle = await getCurrentUserBundle();
  if (!bundle) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  return NextResponse.json(bundle);
}
