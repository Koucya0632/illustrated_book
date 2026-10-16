import { handleTopicChatRequest } from "@/lib/topic-chat/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** One chat: its messages, what is still being written, and the free assists left. */
export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return handleTopicChatRequest(request, { action: "read", chatId: id });
}

/** Deletes the chat, its messages and anything still being written for it. */
export async function DELETE(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return handleTopicChatRequest(request, { action: "delete", chatId: id });
}
