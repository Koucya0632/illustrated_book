// Supabase OAuth callback. Supabase redirects here after Google sign-in;
// we exchange the code for a session cookie and bounce the user onward.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/me";

  if (!code) {
    return NextResponse.redirect(new URL("/signin?error=missing_code", req.url));
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const errUrl = new URL("/signin", req.url);
    errUrl.searchParams.set("error", error.message);
    return NextResponse.redirect(errUrl);
  }

  // Validate `next` is a same-origin path.
  const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/me";
  return NextResponse.redirect(new URL(dest, req.url));
}
