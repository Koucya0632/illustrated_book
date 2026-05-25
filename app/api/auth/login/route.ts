import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  cookieMaxAgeSeconds,
  mintAdminToken,
  timingSafeEqual,
} from "@/lib/auth";

export const runtime = "edge";

export async function POST(req: Request) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: "ADMIN_PASSWORD is not configured on the server." },
      { status: 500 },
    );
  }

  let password = "";
  try {
    const body = await req.json();
    password = String(body.password ?? "");
  } catch {
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
