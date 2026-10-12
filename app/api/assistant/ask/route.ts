import { handleAssistantRequest } from "@/lib/assistant/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** What an answer costs and whether this account may ask — read before the first question. */
export function GET(request: Request) { return handleAssistantRequest(request, "offer"); }
export function POST(request: Request) { return handleAssistantRequest(request, "ask"); }
