import { handleVocabularyRequest } from "@/lib/assistant/vocabulary/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return handleVocabularyRequest(request, "list"); }
