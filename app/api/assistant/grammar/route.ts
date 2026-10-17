import { handleGrammarRequest } from "@/lib/assistant/grammar/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A practice set is five questions with every option explained: 30–40 s is normal.
export const maxDuration = 120;
export function GET(request: Request) { return handleGrammarRequest(request, "offer"); }
export function POST(request: Request) { return handleGrammarRequest(request, "generate"); }
