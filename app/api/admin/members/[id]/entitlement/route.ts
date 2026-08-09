import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { grantProAccess, revokeProGrants, MAX_GRANT_DAYS } from "@/lib/atlas/entitlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manual Pro grants / revocations. Behind the /admin password gate (middleware).
//
// The gate is a single shared password with no per-admin identity, so `actor`
// records the CHANNEL ("admin"), not a person — the audit value lives in the
// mandatory `reason`, which is why the API rejects a blank one rather than
// defaulting it. Do not "helpfully" supply a fallback reason here.
const ACTOR = "admin";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const sql = getSql();
  if (!sql) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  const userId = params.id;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    return NextResponse.json({ error: "invalid user id" }, { status: 400 });
  }

  let body: { action?: string; days?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "請填寫理由" }, { status: 400 });
  }

  const exists = await sql`
    SELECT 1 FROM profiles WHERE id = ${userId}::uuid LIMIT 1
  `;
  if (exists.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    if (body.action === "grant") {
      const days = Number(body.days);
      if (!Number.isFinite(days) || days < 1 || days > MAX_GRANT_DAYS) {
        return NextResponse.json({ error: "天數不合法" }, { status: 400 });
      }
      const result = await grantProAccess({ userId, days, reason, grantedBy: ACTOR });
      return NextResponse.json({ ok: true, expiresAt: result.expiresAt });
    }

    if (body.action === "revoke") {
      const result = await revokeProGrants({ userId, reason, revokedBy: ACTOR });
      if (result.revoked === 0) {
        return NextResponse.json({ error: "這個帳號沒有生效中的贈與" }, { status: 409 });
      }
      return NextResponse.json({ ok: true, revoked: result.revoked });
    }

    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  } catch (err) {
    console.error("[admin/members] entitlement write failed", err);
    return NextResponse.json({ error: "操作失敗" }, { status: 500 });
  }
}
