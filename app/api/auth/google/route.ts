import { NextResponse } from "next/server";
import {
  NEXT_COOKIE,
  STATE_COOKIE,
  STATE_TTL_SEC,
  buildAuthorizeUrl,
  googleConfig,
  randomState,
  redirectUriFromRequest,
} from "@/lib/google-oauth";

export const runtime = "edge";

export async function GET(req: Request) {
  const cfg = googleConfig();
  if (!cfg.enabled || !cfg.clientId) {
    return NextResponse.json(
      {
        error:
          "Google login is not configured. Ask the admin to set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const next = url.searchParams.get("next") || "/me";
  const redirectUri = redirectUriFromRequest(req);
  const state = randomState();

  const authorizeUrl = buildAuthorizeUrl(cfg.clientId, redirectUri, state);

  const res = NextResponse.redirect(authorizeUrl);
  const common = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STATE_TTL_SEC,
  };
  res.cookies.set(STATE_COOKIE, state, common);
  // Stash where to send the user after a successful login.
  res.cookies.set(NEXT_COOKIE, next, common);
  return res;
}
