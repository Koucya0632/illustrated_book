import { handleVocabularyRequest } from "@/lib/assistant/vocabulary/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return handleVocabularyRequest(request, "read", (await context.params).id); }
export async function PATCH(request: Request, context: Context) { return handleVocabularyRequest(request, "favorite", (await context.params).id); }
export async function DELETE(request: Request, context: Context) { return handleVocabularyRequest(request, "delete", (await context.params).id); }
