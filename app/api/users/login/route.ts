import { NextResponse } from "next/server";
import {
  USER_COOKIE,
  mintUserToken,
  userCookieMaxAgeSeconds,
  verifyPassword,
} from "@/lib/user-auth";
import { findByEmail, findByUsername, toPublic } from "@/lib/users-db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { identifier?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const ident = String(body.identifier ?? "").trim();
  const password = String(body.password ?? "");
  if (!ident || !password) {
    return NextResponse.json(
      { error: "請輸入帳號與密碼" },
      { status: 400 },
    );
  }

  try {
    // Accept email OR username
    const user =
      ident.includes("@")
        ? await findByEmail(ident)
        : await findByUsername(ident);

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return NextResponse.json(
        { error: "帳號或密碼錯誤" },
        { status: 401 },
      );
    }

    const token = await mintUserToken(Number(user.id));
    const res = NextResponse.json({ user: toPublic(user) });
    res.cookies.set(USER_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: userCookieMaxAgeSeconds(),
    });
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "login failed" },
      { status: 500 },
    );
  }
}
