import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/auth";

// Edge Runtime is deprecated as of Next.js 16; this handler only clears a
// cookie, so nodejs costs it nothing.
export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
