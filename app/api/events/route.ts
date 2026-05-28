import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export const runtime = "nodejs";

const VALID_TYPES = new Set(["view", "favorite", "pronounce"]);

async function ipHash(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + "::eepd");
  const buf = await crypto.subtle.digest("SHA-256", data);
  const arr = Array.from(new Uint8Array(buf));
  return arr.slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: Request) {
  const sql = getSql();
  if (!sql) return NextResponse.json({ ok: true }); // silently no-op without DB

  let body: {
    type?: string;
    wordId?: string;
    category?: string;
    sessionId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (!body.type || !VALID_TYPES.has(body.type)) {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const hash = await ipHash(ip);

  try {
    await sql`
      INSERT INTO events (type, word_id, category, session_id, ip_hash)
      VALUES (
        ${body.type},
        ${body.wordId ?? null},
        ${body.category ?? null},
        ${body.sessionId ?? null},
        ${hash}
      )
    `;
  } catch (e) {
    // Don't break the user experience on logging failure.
    console.warn("event insert failed", e);
  }

  return NextResponse.json({ ok: true });
}
