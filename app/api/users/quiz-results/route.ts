import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getQuizHistory, recordQuiz } from "@/lib/users-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ history: [] });
  const history = await getQuizHistory(userId);
  return NextResponse.json({ history });
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { quizType?: string; total?: number; correct?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const total = Number(body.total);
  const correct = Number(body.correct);
  const quizType = String(body.quizType ?? "");
  // Bound everything so a client can't stuff arbitrary blobs into the DB.
  // The current UI uses three short fixed strings ("image" | "chinese" |
  // "spelling"); 32 chars is generous headroom.
  if (
    !quizType ||
    quizType.length > 32 ||
    !Number.isInteger(total) ||
    !Number.isInteger(correct) ||
    total < 0 ||
    correct < 0 ||
    total > 1000 ||
    correct > total
  ) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  await recordQuiz(userId, quizType, total, correct);
  return NextResponse.json({ ok: true });
}
