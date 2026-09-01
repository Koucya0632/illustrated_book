import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  cookieMaxAgeSeconds,
  mintAdminToken,
  timingSafeEqual,
} from "@/lib/auth";
import { clientIpHash, hitRateLimit } from "@/lib/ratelimit";
import { readLimitedJson, RequestBodyTooLargeError } from "@/lib/request-body";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: "ADMIN_PASSWORD is not configured on the server." },
      { status: 500 },
    );
  }

  const ipHash = clientIpHash(req);
  for (const rule of [
    { bucket: `admin-login:ip:${ipHash}`, windowSeconds: 900, limit: 8, failClosed: true },
    { bucket: "admin-login:global", windowSeconds: 900, limit: 200, failClosed: true },
  ]) {
    const rate = await hitRateLimit(rule);
    if (!rate.available) {
      return NextResponse.json({ error: "login temporarily unavailable" }, { status: 503 });
    }
    if (!rate.ok) {
      return NextResponse.json(
        { error: "too many attempts" },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
      );
    }
  }

  let password = "";
  try {
    const body = await readLimitedJson(req, 1_024);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    password = String((body as Record<string, unknown>).password ?? "");
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "body too large" }, { status: 413 });
    }
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Cap input length so an attacker can't probe byte-by-byte comparison
  // timing with a huge supplied string.
  if (password.length > 256 || !timingSafeEqual(password, expected)) {
    return NextResponse.json({ error: "wrong password" }, { status: 401 });
  }

  const token = await mintAdminToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: cookieMaxAgeSeconds(),
  });
  return res;
}
