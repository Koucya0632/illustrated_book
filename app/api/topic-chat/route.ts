import { handleTopicChatRequest } from "@/lib/topic-chat/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Starting a chat writes its opening, one model call of a few seconds.
export const maxDuration = 60;
/** Saved chats in one direction (`?learningDirection=&uiLanguage=`), the active one, the price and the balance. */
export function GET(request: Request) { return handleTopicChatRequest(request, { action: "list" }); }
/** A new chat on one topic, ending the active one in that direction, with its opening. */
export function POST(request: Request) { return handleTopicChatRequest(request, { action: "start" }); }
