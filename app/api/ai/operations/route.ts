import { handleAiRequest } from "@/lib/ai-operations/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Room for the after() run that follows the response (worker timeout is 40s).
export const maxDuration = 60;
export function POST(request: Request) { return handleAiRequest(request, "accept"); }
export function GET(request: Request) { return handleAiRequest(request, "list"); }
