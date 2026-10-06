import { handleAiRequest } from "@/lib/ai-operations/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) { return handleAiRequest(request, "quote"); }
