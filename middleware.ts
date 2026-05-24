import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Admin tree: keep our existing single-password gate (admin auth is
  // separate from Supabase user auth, per project decision).
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const token = req.cookies.get(ADMIN_COOKIE)?.value;
    const ok = await verifyAdminToken(token);
    if (ok) return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Everything else: refresh the Supabase session cookie so server components
  // see a fresh access token. We don't gate any other routes here — pages
  // themselves redirect to /signin when they need a user (e.g. /me, /study).
  const { response } = await updateSupabaseSession(req);
  return response;
}

export const config = {
  // Match everything except static files / Next internals; the Supabase docs
  // recommend running on most requests so token refresh is reliable.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
