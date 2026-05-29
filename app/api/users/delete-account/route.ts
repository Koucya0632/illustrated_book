import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Permanently delete the signed-in user. Removing the auth.users row cascades
// to every per-user table (profiles, favorites, learned, settings, cards,
// words, study_logs) via ON DELETE CASCADE. Irreversible.
export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("[delete-account] failed", error);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
