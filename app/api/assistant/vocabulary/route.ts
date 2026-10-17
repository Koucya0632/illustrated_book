import { handleVocabularyRequest } from "@/lib/assistant/vocabulary/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export function GET(request: Request) { return handleVocabularyRequest(request, "offer"); }
export function POST(request: Request) { return handleVocabularyRequest(request, "generate"); }
