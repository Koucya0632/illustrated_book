import { handleTopicChatRequest } from "@/lib/topic-chat/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A turn is one model call, retried once when its reply cannot be shown.
export const maxDuration = 90;

const ACTIONS = ["topic", "opening", "reply", "assist", "stop", "end"] as const;
type Ctx = { params: Promise<{ id: string; action: string }> };

/** topic · opening · reply · assist · stop · end — see lib/topic-chat/service.ts. */
export async function POST(request: Request, ctx: Ctx) {
  const { id, action } = await ctx.params;
  const known = ACTIONS.find(a => a === action);
  if (!known) return Response.json({ error: "not_found" }, { status: 404 });
  return handleTopicChatRequest(request, { action: known, chatId: id });
}
