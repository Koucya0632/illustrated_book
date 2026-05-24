import { NextResponse } from "next/server";
import {
  USER_COOKIE,
  mintUserToken,
  userCookieMaxAgeSeconds,
} from "@/lib/user-auth";
import {
  NEXT_COOKIE,
  STATE_COOKIE,
  exchangeCodeForToken,
  fetchUserInfo,
  googleConfig,
  redirectUriFromRequest,
} from "@/lib/google-oauth";
import {
  createOAuthUser,
  findByEmail,
  findByGoogleSub,
  linkGoogleSub,
  toPublic,
} from "@/lib/users-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorRedirect(req: Request, message: string) {
  const url = new URL("/signin", req.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const cfg = googleConfig();
  if (!cfg.enabled || !cfg.clientId || !cfg.clientSecret) {
    return errorRedirect(req, "Google 登入尚未設定。");
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const googleError = url.searchParams.get("error");

  if (googleError) {
    return errorRedirect(req, `Google: ${googleError}`);
  }
  if (!code || !state) {
    return errorRedirect(req, "缺少 code 或 state。");
  }

  // Verify CSRF state via cookie set by /api/auth/google
  const stateCookie = req.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))
    ?.split("=", 2)[1];
  if (!stateCookie || stateCookie !== state) {
    return errorRedirect(req, "State 不符，請重試。");
  }

  const nextPath =
    req.headers
      .get("cookie")
      ?.split(/;\s*/)
      .find((c) => c.startsWith(`${NEXT_COOKIE}=`))
      ?.split("=", 2)[1] || "/me";

  let info;
  try {
    const tok = await exchangeCodeForToken(
      code,
      cfg.clientId,
      cfg.clientSecret,
      redirectUriFromRequest(req),
    );
    info = await fetchUserInfo(tok.access_token);
  } catch (e) {
    console.error("Google OAuth failed", e);
    return errorRedirect(req, "與 Google 通訊失敗。");
  }

  if (!info.email || info.email_verified === false) {
    return errorRedirect(req, "你的 Google 帳號沒有可信的 email。");
  }

  // 1) Already linked? Just log them in.
  let row = await findByGoogleSub(info.sub);

  // 2) Existing local account with same email? Link Google to it.
  if (!row) {
    const existing = await findByEmail(info.email);
    if (existing) {
      await linkGoogleSub(Number(existing.id), info.sub);
      row = { ...existing, google_sub: info.sub } as typeof existing & {
        google_sub: string;
      };
    }
  }

  // 3) Brand new — create.
  let user = row ? toPublic(row) : null;
  if (!user) {
    const pref = info.given_name || info.name || info.email.split("@")[0] || "user";
    user = await createOAuthUser({
      email: info.email.toLowerCase(),
      preferredUsername: pref,
      googleSub: info.sub,
    });
  }

  const token = await mintUserToken(user.id);
  // Decode the next path; default home if it looks suspicious.
  let dest = "/me";
  try {
    const decoded = decodeURIComponent(nextPath);
    if (decoded.startsWith("/") && !decoded.startsWith("//")) dest = decoded;
  } catch {
    /* ignore */
  }

  const res = NextResponse.redirect(new URL(dest, req.url));
  res.cookies.set(USER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: userCookieMaxAgeSeconds(),
  });
  // clean up oauth temp cookies
  res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(NEXT_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
