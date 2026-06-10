// Per-device APNs / FCM push token registration.
//
//   POST   /api/users/push-token
//          body: { token: string, deviceId: string, platform?: "ios"|"android" }
//          → upserts the row for (user_id, device_id). iOS sends a fresh token
//            on every cold launch — APNs rotates them under the hood.
//
//   DELETE /api/users/push-token?deviceId=...
//          → removes a single device's token (called by Settings → 關閉通知,
//            and by Sign out so the device stops receiving pushes for the
//            previous account).
//
// Both routes require a Bearer token (or web session cookie). RLS on
// user_push_tokens is the second line of defence — the route is the first.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { token?: string; deviceId?: string; platform?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { token, deviceId, platform = "ios" } = body;
  if (!token || !deviceId) {
    return NextResponse.json({ error: "missing token or deviceId" }, { status: 400 });
  }
  if (platform !== "ios" && platform !== "android") {
    return NextResponse.json({ error: "unsupported platform" }, { status: 400 });
  }

  const sql = getSql();
  if (!sql) return NextResponse.json({ error: "db not configured" }, { status: 503 });

  await sql`
    INSERT INTO user_push_tokens (user_id, device_id, token, platform, updated_at)
    VALUES (${userId}, ${deviceId}, ${token}, ${platform}, now())
    ON CONFLICT (user_id, device_id) DO UPDATE SET
      token = EXCLUDED.token,
      platform = EXCLUDED.platform,
      updated_at = now()
  `;

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const deviceId = new URL(req.url).searchParams.get("deviceId");
  if (!deviceId) {
    return NextResponse.json({ error: "missing deviceId" }, { status: 400 });
  }

  const sql = getSql();
  if (!sql) return NextResponse.json({ error: "db not configured" }, { status: 503 });

  await sql`
    DELETE FROM user_push_tokens
    WHERE user_id = ${userId} AND device_id = ${deviceId}
  `;

  return NextResponse.json({ ok: true });
}
