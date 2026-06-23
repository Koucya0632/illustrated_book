import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

const STATUSES = new Set(["pending", "reviewing", "resolved", "rejected", "duplicate"]);

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const sql = getSql();
  if (!sql) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  let body: { status?: string; internalNote?: string; duplicateOf?: number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const status = typeof body.status === "string" ? body.status : "";
  const internalNote =
    typeof body.internalNote === "string" ? body.internalNote.trim().slice(0, 2000) : "";
  const duplicateOf = body.duplicateOf == null ? null : Number(body.duplicateOf);

  if (!STATUSES.has(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }
  if (status === "rejected" && !internalNote) {
    return NextResponse.json({ error: "rejected reports require a note" }, { status: 400 });
  }
  if (
    status === "duplicate" &&
    (!Number.isSafeInteger(duplicateOf) || duplicateOf! <= 0 || duplicateOf === id)
  ) {
    return NextResponse.json({ error: "duplicate reports require a valid primary id" }, { status: 400 });
  }

  if (status === "duplicate") {
    const primary = await sql`SELECT 1 FROM study_reports WHERE id = ${duplicateOf} LIMIT 1`;
    if (primary.length === 0) {
      return NextResponse.json({ error: "primary report not found" }, { status: 400 });
    }
  }

  const rows = await sql`
    UPDATE study_reports
    SET status = ${status},
        internal_note = ${internalNote || null},
        duplicate_of = ${status === "duplicate" ? duplicateOf : null},
        updated_at = now()
    WHERE id = ${id}
    RETURNING id, status, internal_note, duplicate_of
  `;
  if (rows.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, report: rows[0] });
}
