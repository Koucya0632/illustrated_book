import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { revokeProGrants } from "@/lib/atlas/entitlement";
import { grantLifetimeHolding, revokeLifetimeGrant } from "@/lib/atlas/lifetime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manual lifetime grants and legacy revocations. Behind the /admin password gate (middleware).
//
// The gate is a single shared password with no per-admin identity, so `actor`
// records the CHANNEL ("admin"), not a person — the audit value lives in the
// mandatory `reason`, which is why the API rejects a blank one rather than
// defaulting it. Do not "helpfully" supply a fallback reason here.
const ACTOR = "admin";

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  if (!await verifyAdminToken((await cookies()).get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const origin = req.headers.get("origin");
  if (req.headers.get("sec-fetch-site") === "cross-site" || (origin !== null && origin !== new URL(req.url).origin)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const params = await props.params;
  const sql = getSql();
  if (!sql) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  const userId = params.id;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    return NextResponse.json({ error: "invalid user id" }, { status: 400 });
  }

  let body: { action?: string; days?: unknown; reason?: unknown };
  try {
    body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid body");
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason || reason.length > 500) {
    return NextResponse.json({ error: "請填寫理由（最多 500 字）" }, { status: 400 });
  }

  const exists = await sql`
    SELECT 1 FROM profiles WHERE id = ${userId}::uuid LIMIT 1
  `;
  if (exists.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    if (body.action === "grant") {
      return NextResponse.json({ error: "Pro 已停止贈與，請改用永久會員或點數贈與" }, { status: 410 });
    }

    if (body.action === "revoke") {
      const result = await revokeProGrants({ userId, reason, revokedBy: ACTOR });
      if (result.revoked === 0) {
        return NextResponse.json({ error: "這個帳號沒有生效中的贈與" }, { status: 409 });
      }
      return NextResponse.json({ ok: true, revoked: result.revoked });
    }

    if (body.action === "grant_lifetime") {
      const result = await grantLifetimeHolding({ userId, source: "grant", reason, grantedBy: ACTOR });
      if (result.status === "already_held") {
        return NextResponse.json({ error: "這個帳號已經有永久權益" }, { status: 409 });
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "revoke_lifetime") {
      // Only operator-given holdings; an App Store purchase ends via Apple's refund.
      const result = await revokeLifetimeGrant({ userId, reason, revokedBy: ACTOR });
      if (result.revoked === 0) {
        return NextResponse.json({ error: "沒有可收回的永久會員贈與（商店購買請由原商店退款）" }, { status: 409 });
      }
      return NextResponse.json({ ok: true, revoked: result.revoked });
    }

    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  } catch (err) {
    console.error("[admin/members] entitlement write failed", err);
    return NextResponse.json({ error: "操作失敗" }, { status: 500 });
  }
}
