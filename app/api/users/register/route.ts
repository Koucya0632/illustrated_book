import { NextResponse } from "next/server";
import {
  USER_COOKIE,
  hashPassword,
  mintUserToken,
  userCookieMaxAgeSeconds,
} from "@/lib/user-auth";
import { createUser, findByEmail, findByUsername } from "@/lib/users-db";

export const runtime = "nodejs"; // PBKDF2 100k is slow on Edge

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,24}$/;

export async function POST(req: Request) {
  let body: { username?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const username = String(body.username ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: "用戶名須為 3-24 字，限英數與 _ . -" },
      { status: 400 },
    );
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "電子郵件格式不正確" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "密碼至少 6 個字元" }, { status: 400 });
  }

  try {
    if (await findByEmail(email)) {
      return NextResponse.json({ error: "這個電子郵件已被註冊" }, { status: 409 });
    }
    if (await findByUsername(username)) {
      return NextResponse.json({ error: "這個用戶名已被使用" }, { status: 409 });
    }

    const hash = await hashPassword(password);
    const user = await createUser(username, email, hash);
    const token = await mintUserToken(user.id);

    const res = NextResponse.json({ user });
    res.cookies.set(USER_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: userCookieMaxAgeSeconds(),
    });
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "register failed";
    if (/unique|duplicate/i.test(msg)) {
      return NextResponse.json({ error: "帳號已存在" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
